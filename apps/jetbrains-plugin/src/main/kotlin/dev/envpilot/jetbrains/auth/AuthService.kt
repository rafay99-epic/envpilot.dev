package dev.envpilot.jetbrains.auth

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
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
 * Application-level auth state. Port of tokenManager.ts semantics for a
 * single-account plugin:
 *  - tokens live in PasswordSafe (OS keychain / KeePass / libsecret)
 *  - non-secret identity (email/user id) lives in PropertiesComponent
 *  - getFreshToken() refreshes when expiring, single-flighted via a Mutex
 *  - CAS guard: rotated tokens persist only if the stored refresh token is
 *    still the one this refresh started from (sign-out/sign-in race)
 *  - rejected refresh grant clears the session; transient failures keep it
 */
@Service(Service.Level.APP)
class AuthService {
    companion object {
        val AUTH_TOPIC = Topic.create("EnvpilotAuthChanged", AuthStateListener::class.java)

        fun getInstance(): AuthService = ApplicationManager.getApplication().getService(AuthService::class.java)

        private const val PROP_USER_ID = "dev.envpilot.userId"
        private const val PROP_EMAIL = "dev.envpilot.email"
        private const val SERVICE_NAME_ACCESS = "Envpilot WorkOS Access Token"
        private const val SERVICE_NAME_REFRESH = "Envpilot WorkOS Refresh Token"

        @Volatile var outdated = false
            private set

        fun markOutdated(value: Boolean) {
            outdated = value
        }
    }

    private val log = logger<AuthService>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val refreshMutex = Mutex()

    // Cached in-memory copy of the current session; source of truth is storage.
    private val cached = AtomicReference<Session?>(null)

    val email: String? get() = cached.get()?.email

    /** Load persisted state once at startup. */
    fun initialize() {
        if (cached.get() != null) return
        scope.launch {
            cached.set(loadSession())
            notifyChanged()
        }
    }

    suspend fun getSession(): Session? {
        cached.get()?.let { return it }
        val s = loadSession()
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
            val freshTokenForRefresh = getSession() ?: return@withLock null
            try {
                val result = WorkosClient.refreshAccessToken(freshTokenForRefresh.refreshToken)
                // CAS: only persist when the stored refresh token is still the one we used.
                val stored = loadSession()
                if (stored?.refreshToken != freshTokenForRefresh.refreshToken) return@withLock null
                val updated =
                    freshTokenForRefresh.copy(
                        accessToken = result.accessToken,
                        refreshToken = result.refreshToken,
                        sessionId = Jwt.sessionId(result.accessToken) ?: freshTokenForRefresh.sessionId,
                    )
                saveSession(updated)
                result.accessToken
            } catch (e: WorkosClient.WorkosAuthError) {
                if (e.code == WorkosClient.WorkosAuthError.ACCESS_DENIED) {
                    val stored = loadSession()
                    if (stored?.refreshToken != freshTokenForRefresh.refreshToken) return@withLock null
                    log.warn("Session refresh rejected — signing out.")
                    clearSession()
                    null
                } else {
                    // Transient — keep creds, caller retries later.
                    log.warn("Transient session refresh failure: ${e.message}")
                    dev.envpilot.jetbrains.telemetry.EnvSentry.capture(e, mapOf("surface" to "token-refresh"))
                    null
                }
            }
        }
    }

    /** Full device-flow login; runs on IO, notifies listeners when done. */
    fun startSignIn(onDone: (String?, Exception?) -> Unit) {
        scope.launch {
            try {
                val deviceCode = WorkosClient.requestDeviceCode()
                com.intellij.ide.BrowserUtil.browse(deviceCode.verificationUriComplete)
                showUserCodeDialog(deviceCode.userCode)

                val deadline = System.currentTimeMillis() + deviceCode.expiresIn * 1000
                var intervalMs = deviceCode.interval * 1000
                while (System.currentTimeMillis() < deadline) {
                    when (val poll = WorkosClient.pollForToken(deviceCode.deviceCode)) {
                        is WorkosClient.PollResult.Complete -> {
                            val user =
                                poll.token.user
                                    ?: throw WorkosClient.WorkosAuthError(
                                        "WorkOS returned a token without user info.",
                                        WorkosClient.WorkosAuthError.INVALID_RESPONSE,
                                    )
                            val session =
                                Session(
                                    userId = user.id,
                                    email = user.email,
                                    accessToken = poll.token.accessToken,
                                    refreshToken = poll.token.refreshToken,
                                    sessionId = Jwt.sessionId(poll.token.accessToken),
                                )
                            saveSession(session)
                            notifyChanged()
                            onDone(session.email, null)
                            return@launch
                        }
                        WorkosClient.PollResult.Pending,
                        WorkosClient.PollResult.NetworkError,
                        -> Unit
                        WorkosClient.PollResult.SlowDown -> intervalMs += 5000
                        WorkosClient.PollResult.Denied ->
                            throw WorkosClient.WorkosAuthError(
                                "Sign-in was denied in the browser.",
                                WorkosClient.WorkosAuthError.ACCESS_DENIED,
                            )
                        WorkosClient.PollResult.Expired ->
                            throw WorkosClient.WorkosAuthError(
                                "The sign-in code expired. Try again.",
                                WorkosClient.WorkosAuthError.EXPIRED_TOKEN,
                            )
                    }
                    kotlinx.coroutines.delay(intervalMs)
                }
                throw WorkosClient.WorkosAuthError(
                    "Sign-in timed out before approval.",
                    WorkosClient.WorkosAuthError.EXPIRED_TOKEN,
                )
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

    // ── Storage ──────────────────────────────────────────────────────────────

    private val accessAttributes by lazy {
        CredentialAttributes(generateServiceName("Envpilot", SERVICE_NAME_ACCESS))
    }
    private val refreshAttributes by lazy {
        CredentialAttributes(generateServiceName("Envpilot", SERVICE_NAME_REFRESH))
    }

    private suspend fun loadSession(): Session? {
        val userId = props().getValue(PROP_USER_ID) ?: return null
        val emailAddr = props().getValue(PROP_EMAIL) ?: return null
        val access = PasswordSafe.instance.getPassword(accessAttributes)
        val refresh = PasswordSafe.instance.getPassword(refreshAttributes)
        if (access.isNullOrBlank() || refresh.isNullOrBlank()) return null
        return Session(userId, emailAddr, access, refresh, Jwt.sessionId(access))
    }

    private suspend fun saveSession(session: Session) {
        props().setValue(PROP_USER_ID, session.userId)
        props().setValue(PROP_EMAIL, session.email)
        PasswordSafe.instance.set(accessAttributes, Credentials(session.userId, session.accessToken))
        PasswordSafe.instance.set(refreshAttributes, Credentials(session.userId, session.refreshToken))
        cached.set(session)
    }

    private suspend fun clearSession() {
        cached.set(null)
        props().unsetValue(PROP_USER_ID)
        props().unsetValue(PROP_EMAIL)
        PasswordSafe.instance.set(accessAttributes, null)
        PasswordSafe.instance.set(refreshAttributes, null)
    }

    private fun props() = com.intellij.ide.util.PropertiesComponent.getInstance()

    private fun notifyChanged() {
        ApplicationManager.getApplication().messageBus.syncPublisher(AUTH_TOPIC).authChanged()
    }

    private fun showUserCodeDialog(userCode: String) {
        ApplicationManager.getApplication().invokeLater {
            javax.swing.JOptionPane.showMessageDialog(
                null,
                "To sign in to Envpilot, enter this code in your browser:\n\n$userCode",
                "Envpilot Sign In",
                javax.swing.JOptionPane.INFORMATION_MESSAGE,
            )
        }
    }
}
