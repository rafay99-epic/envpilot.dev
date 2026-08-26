package dev.envpilot.jetbrains.auth

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.util.messages.Topic
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicReference

/** Fired on the message bus whenever the signed-in identity changes. */
interface AuthStateListener {
    fun authChanged()
}

data class Session(
    val userId: String,
    val email: String,
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String?,
)

/**
 * Application-level auth orchestration: AuthKit browser login, fresh-token
 * access with single-flight refresh and a CAS guard against sign-out/sign-in
 * races. Storage mechanics live in [TokenStore]; the WorkOS flow itself in
 * [AuthKitLogin].
 */
@Service(Service.Level.APP)
class AuthService {
    companion object {
        val AUTH_TOPIC = Topic.create("EnvpilotAuthChanged", AuthStateListener::class.java)

        fun getInstance(): AuthService = ApplicationManager.getApplication().getService(AuthService::class.java)

        @Volatile var outdated = false
            private set

        fun markOutdated(value: Boolean) {
            outdated = value
        }
    }

    private val log = logger<AuthService>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val refreshMutex = Mutex()
    private val store = TokenStore()

    // Cached in-memory copy of the current session; source of truth is storage.
    private val cached = AtomicReference<Session?>(null)

    val email: String? get() = cached.get()?.email
    val userId: String? get() = cached.get()?.userId

    fun accounts(): List<AccountSummary> = store.accounts()

    /** Load persisted state once at startup. */
    fun initialize() {
        if (cached.get() != null) return
        scope.launch {
            cached.set(store.load())
            notifyChanged()
        }
    }

    suspend fun getSession(): Session? {
        cached.get()?.let { return it }
        val s = store.load()
        s?.let { cached.set(it) }
        return s
    }

    /**
     * Return a valid access token, refreshing first when expired or about to
     * expire (<60s). Returns null when signed out or when refresh definitively
     * fails. Transient failures keep credentials; rejected grants clear them.
     */
    suspend fun getFreshToken(force: Boolean = false): String? {
        val session = getSession() ?: return null
        if (!force && !Jwt.isExpiring(session.accessToken)) return session.accessToken
        if (session.refreshToken.isBlank()) return null

        return refreshMutex.withLock {
            val sessionForRefresh = getSession() ?: return@withLock null
            try {
                val result = AuthKitLogin.refresh(sessionForRefresh.refreshToken)
                // CAS: only persist when the stored refresh token is still the one we used.
                val stored = store.load()
                if (stored?.refreshToken != sessionForRefresh.refreshToken) return@withLock null
                val updated = sessionForRefresh.withRefresh(result)
                store.save(updated)
                cached.set(updated)
                result.accessToken
            } catch (e: AuthKitLogin.LoginCancelled) {
                val stored = store.load()
                if (stored?.refreshToken != sessionForRefresh.refreshToken) return@withLock null
                if (e.transient) {
                    log.warn("Transient session refresh failure: ${e.message}")
                    dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "token-refresh"))
                    null
                } else {
                    log.warn("Session refresh rejected — signing out.")
                    clearSession()
                    notifyChanged()
                    null
                }
            }
        }
    }

    /** Full AuthKit browser login; runs on IO, notifies listeners when done. */
    fun startSignIn(onDone: (String?, Exception?) -> Unit) {
        scope.launch {
            try {
                val token = AuthKitLogin.signIn()
                val session = token.toSession()
                if (!purgeManagedFiles()) {
                    throw AuthKitLogin.LoginCancelled("Save or revert managed files before changing accounts.")
                }
                store.save(session)
                cached.set(session)
                notifyChanged()
                onDone(session.email, null)
            } catch (e: Exception) {
                onDone(null, e)
            }
        }
    }

    fun signOut() {
        scope.launch {
            val safeToSwitch = purgeManagedFiles()
            cached.get()?.userId?.let { store.remove(it, activateNext = safeToSwitch) }
            cached.set(if (safeToSwitch) store.load() else null)
            notifyChanged()
        }
    }

    fun signOutAll() {
        scope.launch {
            purgeManagedFiles()
            cached.set(null)
            store.clearAll()
            notifyChanged()
        }
    }

    fun switchAccount(userId: String) {
        scope.launch {
            if (!purgeManagedFiles()) return@launch
            val session = store.activate(userId) ?: return@launch
            cached.set(session)
            notifyChanged()
        }
    }

    private suspend fun clearSession() {
        val safeToSwitch = purgeManagedFiles()
        cached.get()?.userId?.let { store.remove(it, activateNext = safeToSwitch) }
        cached.set(if (safeToSwitch) store.load() else null)
    }

    private fun notifyChanged() {
        ApplicationManager.getApplication().messageBus.syncPublisher(AUTH_TOPIC).authChanged()
        dev.envpilot.jetbrains.convex.ConvexSyncService.getInstance().restartForAuthChange()
    }

    private fun purgeManagedFiles(): Boolean {
        var preserved = 0
        for (project in com.intellij.openapi.project.ProjectManager.getInstance().openProjects) {
            preserved += dev.envpilot.jetbrains.editor.EnvEditorService.getInstance(project).purgeManagedFiles().preserved
        }
        if (preserved > 0) {
            com.intellij.notification.NotificationGroupManager.getInstance()
                .getNotificationGroup("dev.envpilot.notifications")
                .createNotification(
                    "Account change blocked because $preserved managed file(s) contain local changes or predated Envpilot.",
                    com.intellij.notification.NotificationType.WARNING,
                )
                .notify(null)
        }
        return preserved == 0
    }
}

internal fun Session.withRefresh(result: AuthKitLogin.TokenResponse): Session =
    copy(
        accessToken = result.accessToken,
        refreshToken = result.refreshToken?.takeIf { it.isNotBlank() } ?: refreshToken,
        sessionId = Jwt.sessionId(result.accessToken) ?: sessionId,
    )

internal fun AuthKitLogin.TokenResponse.toSession(): Session {
    val identity = user ?: throw AuthKitLogin.LoginCancelled("WorkOS returned no user identity.")
    val refresh = refreshToken?.takeIf { it.isNotBlank() } ?: throw AuthKitLogin.LoginCancelled("WorkOS returned no refresh token.")
    return Session(
        userId = identity.id,
        email = identity.email,
        accessToken = accessToken,
        refreshToken = refresh,
        sessionId = Jwt.sessionId(accessToken),
    )
}
