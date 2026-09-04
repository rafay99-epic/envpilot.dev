package dev.envpilot.jetbrains.auth

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.util.messages.Topic
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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
class AuthService(private val scope: CoroutineScope) {
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
    private val refreshMutex = Mutex()

    // Serializes every session mutation; TokenStore's read-modify-write on
    // PropertiesComponent is not atomic on its own.
    private val sessionMutex = Mutex()
    private val store = TokenStore()

    // Cached in-memory copy of the current session; source of truth is storage.
    private val cached = AtomicReference<Session?>(null)

    val email: String? get() = cached.get()?.email
    val userId: String? get() = cached.get()?.userId

    fun accounts(): List<AccountSummary> = store.accounts()

    /** Load persisted state once at startup. */
    fun initialize() {
        if (cached.get() != null) return
        scope.launch(Dispatchers.IO) {
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
        if (!needsRefresh(session.accessToken, force)) return session.accessToken
        if (session.refreshToken.isBlank()) return null

        return refreshMutex.withLock {
            val sessionForRefresh = getSession() ?: return@withLock null
            // A caller queued behind the lock finds the token someone ahead of it rotated.
            if (sessionForRefresh.accessToken != session.accessToken && !Jwt.isExpiring(sessionForRefresh.accessToken)) {
                return@withLock sessionForRefresh.accessToken
            }
            try {
                val result = AuthKitLogin.refresh(sessionForRefresh.refreshToken)
                // Compare-and-save under sessionMutex so a sign-out or switch that
                // landed during the network call is not undone by the stale save.
                sessionMutex.withLock {
                    val stored = store.load()
                    if (stored?.refreshToken != sessionForRefresh.refreshToken) return@withLock null
                    val updated = sessionForRefresh.withRefresh(result)
                    store.save(updated)
                    cached.set(updated)
                    result.accessToken
                }
            } catch (e: AuthKitLogin.LoginCancelled) {
                sessionMutex.withLock {
                    val stored = store.load()
                    if (stored?.refreshToken != sessionForRefresh.refreshToken) return@withLock null
                    if (e.transient) {
                        log.warn("Transient session refresh failure: ${e.message}")
                        dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "token-refresh"))
                        null
                    } else {
                        log.warn("Session refresh rejected — signing out.")
                        clearSessionLocked()
                        notifyChanged()
                        null
                    }
                }
            }
        }
    }

    /** Full AuthKit browser login; runs on IO, notifies listeners when done. */
    fun startSignIn(onDone: (String?, Exception?) -> Unit) {
        scope.launch(Dispatchers.IO) {
            try {
                val token = AuthKitLogin.signIn()
                val session = token.toSession()
                sessionMutex.withLock {
                    if (!purgeManagedFiles()) {
                        throw AuthKitLogin.LoginCancelled("Save or revert managed files before changing accounts.")
                    }
                    store.save(session)
                    cached.set(session)
                    notifyChanged()
                }
                onDone(session.email, null)
            } catch (e: Exception) {
                onDone(null, e)
            }
        }
    }

    /** Sign-out always completes; managed files with local changes are preserved on disk. */
    fun signOut() {
        scope.launch(Dispatchers.IO) {
            sessionMutex.withLock {
                val safeToSwitch = purgeManagedFiles(notifyBlocked = false)
                cached.get()?.userId?.let { store.remove(it, activateNext = safeToSwitch) }
                cached.set(if (safeToSwitch) store.load() else null)
                notifyChanged()
            }
        }
    }

    fun signOutAll() {
        scope.launch(Dispatchers.IO) {
            sessionMutex.withLock {
                purgeManagedFiles(notifyBlocked = false)
                cached.set(null)
                store.clearAll()
                notifyChanged()
            }
        }
    }

    fun switchAccount(userId: String) {
        scope.launch(Dispatchers.IO) {
            sessionMutex.withLock {
                if (!purgeManagedFiles()) return@withLock
                val session = store.activate(userId) ?: return@withLock
                cached.set(session)
                notifyChanged()
            }
        }
    }

    // Caller holds sessionMutex (and refreshMutex above it; the order is one-way).
    private fun clearSessionLocked() {
        val safeToSwitch = purgeManagedFiles(notifyBlocked = false)
        cached.get()?.userId?.let { store.remove(it, activateNext = safeToSwitch) }
        cached.set(if (safeToSwitch) store.load() else null)
    }

    private fun notifyChanged() {
        ApplicationManager.getApplication().messageBus.syncPublisher(AUTH_TOPIC).authChanged()
        dev.envpilot.jetbrains.convex.ConvexSyncService.getInstance().restartForAuthChange()
    }

    private fun purgeManagedFiles(notifyBlocked: Boolean = true): Boolean {
        var preserved = 0
        for (project in com.intellij.openapi.project.ProjectManager.getInstance().openProjects) {
            preserved += dev.envpilot.jetbrains.editor.EnvEditorService.getInstance(project).purgeManagedFiles().preserved
        }
        if (preserved > 0 && notifyBlocked) {
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

/** Refresh when forced, or when the current access token is expired/near expiry. */
internal fun needsRefresh(
    accessToken: String,
    force: Boolean,
): Boolean = force || Jwt.isExpiring(accessToken)

internal fun Session.withRefresh(result: AuthKitLogin.TokenResponse): Session =
    copy(
        accessToken = result.accessToken,
        refreshToken = result.refreshToken?.takeIf { it.isNotBlank() } ?: refreshToken,
        sessionId = Jwt.sessionId(result.accessToken) ?: sessionId,
    )

internal fun AuthKitLogin.TokenResponse.toSession(): Session {
    // WorkOS sometimes omits the user object; the access token's sub claim is the same id.
    val identityId = user?.id ?: Jwt.subject(accessToken) ?: throw AuthKitLogin.LoginCancelled("WorkOS returned no user identity.")
    val refresh = refreshToken?.takeIf { it.isNotBlank() } ?: throw AuthKitLogin.LoginCancelled("WorkOS returned no refresh token.")
    return Session(
        userId = identityId,
        email = user?.email ?: identityId,
        accessToken = accessToken,
        refreshToken = refresh,
        sessionId = Jwt.sessionId(accessToken),
    )
}
