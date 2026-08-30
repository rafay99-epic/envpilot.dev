package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.auth.Jwt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class JwtTest {
    private val gson = com.google.gson.Gson()

    private fun token(payload: Map<String, Any?>): String {
        fun b64(s: String) = Base64.getUrlEncoder().withoutPadding().encodeToString(s.toByteArray())
        val header = b64("""{"alg":"RS256","typ":"JWT"}""")
        val body = b64(gson.toJson(payload))
        return "$header.$body.sig"
    }

    @Test
    fun `reads exp sid sub`() {
        val t = token(mapOf("exp" to 1234L, "sid" to "sess_1", "sub" to "user_1"))
        assertEquals(1234L, Jwt.exp(t))
        assertEquals("sess_1", Jwt.sessionId(t))
        assertEquals("user_1", Jwt.subject(t))
    }

    @Test
    fun `malformed token returns nulls`() {
        assertNull(Jwt.exp("not-a-jwt"))
        assertNull(Jwt.decodePayload(""))
        assertNull(Jwt.sessionId(token(mapOf("exp" to 1L))))
    }

    @Test
    fun `unreadable exp counts as expiring`() {
        assertTrue(Jwt.isExpiring("garbage"))
    }

    @Test
    fun `future exp not expiring past exp expiring`() {
        val future = System.currentTimeMillis() / 1000 + 600
        val past = System.currentTimeMillis() / 1000 - 10
        assertFalse(Jwt.isExpiring(token(mapOf("exp" to future))))
        assertTrue(Jwt.isExpiring(token(mapOf("exp" to past))))
    }
}
