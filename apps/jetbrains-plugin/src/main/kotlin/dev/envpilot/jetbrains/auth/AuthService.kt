package dev.envpilot.jetbrains.auth

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.util.messages.Topic
import dev.envpilot.jetbrains.telemetry.EnvSentry
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
                val updated =
                    sessionForRefresh.copy(
                        accessToken = result.accessToken,
                        refreshToken = result.refreshToken,
                        sessionId = Jwt.sessionId(result.accessToken) ?: sessionForRefresh.sessionId,
                    )
                store.save(updated)
                cached.set(updated)
                result.accessToken
            } catch (e: AuthKitLogin.LoginCancelled) {
                val stored = store.load()
                if (stored?.refreshToken != sessionForRefresh.refreshToken) return@withLock null
                if (e.transient) {
                    log.warn("Transient session refresh failure: ${e.message}")
                    EnvSentry.capture(e, mapOf("surface" to "token-refresh"))
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
                val session =
                    Session(
                        userId = token.user?.id ?: token.accessToken,
                        email = token.user?.email ?: "unknown",
                        accessToken = token.accessToken,
                        refreshToken = token.refreshToken,
                        sessionId = Jwt.sessionId(token.accessToken),
                    )
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
            clearSession()
            notifyChanged()
        }
    }

    private suspend fun clearSession() {
        cached.set(null)
        store.clear()
    }

    private fun notifyChanged() {
        ApplicationManager.getApplication().messageBus.syncPublisher(AUTH_TOPIC).authChanged()
    }
}
