package dev.envpilot.jetbrains.auth

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.ide.util.PropertiesComponent

typealias StoredSession = Session

/**
 * Secret and identity storage for the single WorkOS session.
 * Tokens live in PasswordSafe (OS keychain); non-secret identity in
 * PropertiesComponent.
 */
class TokenStore {
    private val accessAttributes by lazy {
        CredentialAttributes(generateServiceName("Envpilot", SERVICE_NAME_ACCESS))
    }
    private val refreshAttributes by lazy {
        CredentialAttributes(generateServiceName("Envpilot", SERVICE_NAME_REFRESH))
    }

    fun load(): Session? {
        val userId = props().getValue(PROP_USER_ID) ?: return null
        val email = props().getValue(PROP_EMAIL) ?: return null
        val access = PasswordSafe.instance.getPassword(accessAttributes)
        val refresh = PasswordSafe.instance.getPassword(refreshAttributes)
        if (access.isNullOrBlank() || refresh.isNullOrBlank()) return null
        return Session(userId, email, access, refresh, Jwt.sessionId(access))
    }

    fun save(session: Session) {
        props().setValue(PROP_USER_ID, session.userId)
        props().setValue(PROP_EMAIL, session.email)
        PasswordSafe.instance.set(accessAttributes, Credentials(session.userId, session.accessToken))
        PasswordSafe.instance.set(refreshAttributes, Credentials(session.userId, session.refreshToken))
    }

    fun clear() {
        props().unsetValue(PROP_USER_ID)
        props().unsetValue(PROP_EMAIL)
        PasswordSafe.instance.set(accessAttributes, null)
        PasswordSafe.instance.set(refreshAttributes, null)
    }

    private fun props() = PropertiesComponent.getInstance()

    private companion object {
        const val PROP_USER_ID = "dev.envpilot.userId"
        const val PROP_EMAIL = "dev.envpilot.email"
        const val SERVICE_NAME_ACCESS = "Envpilot WorkOS Access Token"
        const val SERVICE_NAME_REFRESH = "Envpilot WorkOS Refresh Token"
    }
}
