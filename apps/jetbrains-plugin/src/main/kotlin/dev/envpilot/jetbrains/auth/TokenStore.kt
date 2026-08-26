package dev.envpilot.jetbrains.auth

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.ide.util.PropertiesComponent

data class AccountSummary(val userId: String, val email: String)

/** Tokens stay in PasswordSafe. Preferences hold account ids and emails only. */
class TokenStore {
    fun load(userId: String? = activeUserId()): Session? {
        val id = userId ?: return migrateLegacy()
        val email = props().getValue(emailKey(id)) ?: return null
        val access = PasswordSafe.instance.getPassword(accessAttributes(id))
        val refresh = PasswordSafe.instance.getPassword(refreshAttributes(id))
        if (access.isNullOrBlank() || refresh.isNullOrBlank()) return null
        return Session(id, email, access, refresh, Jwt.sessionId(access))
    }

    fun save(session: Session) {
        val ids = accountIds() + session.userId
        props().setValue(PROP_ACCOUNT_IDS, ids.joinToString(","))
        props().setValue(PROP_ACTIVE_USER_ID, session.userId)
        props().setValue(emailKey(session.userId), session.email)
        PasswordSafe.instance.set(accessAttributes(session.userId), Credentials(session.userId, session.accessToken))
        PasswordSafe.instance.set(refreshAttributes(session.userId), Credentials(session.userId, session.refreshToken))
    }

    fun accounts(): List<AccountSummary> =
        accountIds().mapNotNull { id ->
            props().getValue(emailKey(id))?.let { AccountSummary(id, it) }
        }

    fun activate(userId: String): Session? {
        val session = load(userId) ?: return null
        props().setValue(PROP_ACTIVE_USER_ID, userId)
        return session
    }

    fun remove(
        userId: String,
        activateNext: Boolean = true,
    ) {
        PasswordSafe.instance.set(accessAttributes(userId), null)
        PasswordSafe.instance.set(refreshAttributes(userId), null)
        props().unsetValue(emailKey(userId))
        val remaining = accountIds() - userId
        props().setValue(PROP_ACCOUNT_IDS, remaining.joinToString(","))
        if (activeUserId() == userId) {
            if (activateNext) {
                remaining.firstOrNull()?.let { props().setValue(PROP_ACTIVE_USER_ID, it) }
                    ?: props().unsetValue(PROP_ACTIVE_USER_ID)
            } else {
                props().unsetValue(PROP_ACTIVE_USER_ID)
            }
        }
    }

    fun clearAll() {
        accountIds().forEach(::remove)
    }

    private fun migrateLegacy(): Session? {
        val id = props().getValue(LEGACY_USER_ID) ?: return null
        val email = props().getValue(LEGACY_EMAIL) ?: return null
        val access = PasswordSafe.instance.getPassword(legacyAccessAttributes()) ?: return null
        val refresh = PasswordSafe.instance.getPassword(legacyRefreshAttributes()) ?: return null
        return Session(id, email, access, refresh, Jwt.sessionId(access)).also { session ->
            save(session)
            props().unsetValue(LEGACY_USER_ID)
            props().unsetValue(LEGACY_EMAIL)
            PasswordSafe.instance.set(legacyAccessAttributes(), null)
            PasswordSafe.instance.set(legacyRefreshAttributes(), null)
        }
    }

    private fun accountIds(): LinkedHashSet<String> =
        props().getValue(PROP_ACCOUNT_IDS).orEmpty()
            .split(',')
            .filterTo(linkedSetOf()) { it.isNotBlank() }

    private fun activeUserId(): String? = props().getValue(PROP_ACTIVE_USER_ID)

    private fun accessAttributes(userId: String) = attributes("WorkOS Access Token:$userId")

    private fun refreshAttributes(userId: String) = attributes("WorkOS Refresh Token:$userId")

    private fun legacyAccessAttributes() = attributes("Envpilot WorkOS Access Token")

    private fun legacyRefreshAttributes() = attributes("Envpilot WorkOS Refresh Token")

    private fun attributes(key: String) = CredentialAttributes(generateServiceName("Envpilot", key))

    private fun emailKey(userId: String) = "dev.envpilot.account.$userId.email"

    private fun props() = PropertiesComponent.getInstance()

    private companion object {
        const val PROP_ACCOUNT_IDS = "dev.envpilot.accountIds"
        const val PROP_ACTIVE_USER_ID = "dev.envpilot.activeUserId"
        const val LEGACY_USER_ID = "dev.envpilot.userId"
        const val LEGACY_EMAIL = "dev.envpilot.email"
    }
}
