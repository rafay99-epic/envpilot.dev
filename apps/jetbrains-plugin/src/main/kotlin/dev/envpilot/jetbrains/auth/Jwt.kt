package dev.envpilot.jetbrains.auth

import com.google.gson.JsonParser
import com.google.gson.JsonPrimitive
import java.util.Base64

object Jwt {
    private fun claim(
        token: String,
        name: String,
    ): JsonPrimitive? =
        try {
            token.split(".").getOrNull(1)?.let { payload ->
                JsonParser.parseString(String(Base64.getUrlDecoder().decode(payload), Charsets.UTF_8))
                    .asJsonObject.get(name)?.takeIf { it.isJsonPrimitive }?.asJsonPrimitive
            }
        } catch (_: Exception) {
            null
        }

    fun exp(token: String): Long? = claim(token, "exp")?.takeIf { it.isNumber }?.asLong

    fun sessionId(token: String): String? = claim(token, "sid")?.takeIf { it.isString }?.asString

    fun subject(token: String): String? = claim(token, "sub")?.takeIf { it.isString }?.asString

    fun isExpiring(token: String): Boolean {
        val e = exp(token) ?: return true
        return e - (System.currentTimeMillis() / 1000) <= 60
    }
}
