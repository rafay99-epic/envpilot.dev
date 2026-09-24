package dev.envpilot.jetbrains.auth

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.ProjectManager
import com.intellij.util.messages.Topic
import dev.envpilot.jetbrains.convex.ConvexSyncService
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.errors.Errors
import dev.envpilot.jetbrains.version.VersionCheck
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.time.Duration.Companion.hours

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

@Service(Service.Level.APP)
class AuthService(private val scope: CoroutineScope) {
    companion object {
        val AUTH_TOPIC = Topic.create("EnvpilotAuthChanged", AuthStateListener::class.java)

        private const val FILES_BLOCK_SIGN_IN = "Save or revert managed files before changing accounts."

        fun getInstance(): AuthService = ApplicationManager.getApplication().getService(AuthService::class.java)

        @Volatile var outdated = false
            private set

        fun markOutdated(value: Boolean) {
            outdated = value
        }
    }

    private val log = logger<AuthService>()
    private val refreshMutex = Mutex()
    private val sessionMutex = Mutex()
    internal var store = TokenStore()
    internal val cached = AtomicReference<Session?>(null)
    private val initialized = AtomicBoolean(false)

    @Volatile private var signInJob: Job? = null

    val email: String? get() = cached.get()?.email
    val userId: String? get() = cached.get()?.userId

    fun accounts(): List<AccountSummary> = store.accounts()

    fun initialize() {
        if (!initialized.compareAndSet(false, true)) return
        scope.launch(Dispatchers.IO) {
            sessionMutex.withLock { adopt(store.load()) }
        }
        scope.launch(Dispatchers.IO) {
            while (isActive) {
                delay(1.hours)
                VersionCheck.currentVersion()?.let { VersionCheck.check(it) }
            }
        }
    }

    suspend fun getSession(): Session? {
        cached.get()?.let { return it }
        return sessionMutex.withLock { cached.get() ?: store.load().also(::adopt) }
    }

    suspend fun getFreshToken(force: Boolean = false): String? {
        val session = getSession() ?: return null
        if (!needsRefresh(session.accessToken, force)) return session.accessToken

        return refreshMutex.withLock {
            val stored = sessionMutex.withLock { store.load().also(::adopt) } ?: return@withLock null
            adoptableToken(session, stored)?.let { return@withLock it }
            try {
                val result = AuthKitLogin.refresh(stored.refreshToken)
                sessionMutex.withLock {
                    val latest = store.load()
                    if (latest?.refreshToken != stored.refreshToken) {
                        adopt(latest)
                        return@withLock latest?.accessToken
                    }
                    val updated = stored.withRefresh(result)
                    store.save(updated)
                    cached.set(updated)
                    result.accessToken
                }
            } catch (e: AuthKitLogin.LoginCancelled) {
                sessionMutex.withLock {
                    val latest = store.load()
                    if (latest?.refreshToken != stored.refreshToken) {
                        adopt(latest)
                        return@withLock latest?.accessToken
                    }
                    if (e.transient) {
                        log.warn("Transient session refresh failure: ${e.message}")
                        Errors.report(e, mapOf("surface" to "token-refresh"))
                    } else {
                        log.warn("Session refresh rejected; signing out.")
                        clearSessionLocked()
                        notifyChanged()
                    }
                    null
                }
            }
        }
    }

    @Synchronized
    fun startSignIn(onDone: (String?, Exception?) -> Unit) {
        if (signInJob?.isActive == true) return
        signInJob =
            scope.launch(Dispatchers.IO) {
                try {
                    if (!sessionMutex.withLock { purgeManagedFiles() }) throw AuthKitLogin.LoginCancelled(FILES_BLOCK_SIGN_IN)
                    val session =
                        AuthKitLogin.signIn { code ->
                            notify("Confirm code $code in your browser to sign in to Envpilot.", NotificationType.INFORMATION)
                        }.toSession()
                    sessionMutex.withLock {
                        if (!purgeManagedFiles()) throw AuthKitLogin.LoginCancelled(FILES_BLOCK_SIGN_IN)
                        store.save(session)
                        cached.set(session)
                        notifyChanged()
                    }
                    onDone(session.email, null)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    onDone(null, e)
                }
            }
    }

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

    private fun clearSessionLocked() {
        val safeToSwitch = purgeManagedFiles(notifyBlocked = false)
        cached.get()?.userId?.let { store.remove(it, activateNext = safeToSwitch) }
        cached.set(if (safeToSwitch) store.load() else null)
    }

    private fun adopt(session: Session?) {
        val previous = cached.getAndSet(session)
        if (previous?.userId != session?.userId) notifyChanged()
    }

    private fun notifyChanged() {
        ApplicationManager.getApplication().messageBus.syncPublisher(AUTH_TOPIC).authChanged()
        ConvexSyncService.getInstance().restartForAuthChange()
    }

    private fun notify(
        text: String,
        type: NotificationType,
    ) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("dev.envpilot.notifications")
            .createNotification(text, type)
            .notify(null)
    }

    private fun purgeManagedFiles(notifyBlocked: Boolean = true): Boolean {
        val preserved =
            ProjectManager.getInstance().openProjects.sumOf {
                EnvEditorService.getInstance(it).purgeManagedFiles().preserved
            }
        if (preserved > 0 && notifyBlocked) {
            notify(
                "Account change blocked because $preserved managed file(s) contain local changes or predated Envpilot.",
                NotificationType.WARNING,
            )
        }
        return preserved == 0
    }
}

internal fun needsRefresh(
    accessToken: String,
    force: Boolean,
): Boolean = force || Jwt.isExpiring(accessToken)

internal fun adoptableToken(
    cached: Session,
    stored: Session,
): String? = stored.accessToken.takeIf { it != cached.accessToken && !Jwt.isExpiring(it) }

internal fun Session.withRefresh(result: AuthKitLogin.TokenResponse): Session =
    copy(
        accessToken = result.accessToken,
        refreshToken = result.refreshToken?.takeIf { it.isNotBlank() } ?: refreshToken,
        sessionId = Jwt.sessionId(result.accessToken) ?: sessionId,
    )

internal fun AuthKitLogin.TokenResponse.toSession(): Session {
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
