package dev.envpilot.jetbrains.auth

import com.google.gson.Gson
import java.util.Base64

/**
 * Minimal, dependency-free JWT reader. Port of apps/vscode-extension/src/utils/jwt.ts.
 *
 * Tokens are never verified locally — verification happens server-side. We only
 * read unverified claims (exp, sid, sub) to schedule refreshes and label the
 * session.
 */
object Jwt {
    private val gson = Gson()

    fun decodePayload(token: String): Map<String, Any?>? =
        try {
            val parts = token.split(".")
            if (parts.size < 2) {
                null
            } else {
                val json = String(Base64.getUrlDecoder().decode(parts[1]), Charsets.UTF_8)
                @Suppress("UNCHECKED_CAST")
                gson.fromJson(json, MutableMap::class.java) as? Map<String, Any?>
            }
        } catch (_: Exception) {
            null
        }

    fun exp(token: String): Long? {
        val v = decodePayload(token)?.get("exp")
        return (v as? Number)?.toLong()
    }

    fun sessionId(token: String): String? = stringClaim(token, "sid")

    fun subject(token: String): String? = stringClaim(token, "sub")

    /** True when expired or within [skewSeconds] of expiring; unreadable exp counts as expiring. */
    fun isExpiring(
        token: String,
        skewSeconds: Long = 60,
    ): Boolean {
        val e = exp(token) ?: return true
        return e - (System.currentTimeMillis() / 1000) <= skewSeconds
    }

    private fun stringClaim(
        token: String,
        claim: String,
    ): String? = decodePayload(token)?.get(claim) as? String
}
