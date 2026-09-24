package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.auth.AuthKitLogin
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.auth.Session
import dev.envpilot.jetbrains.auth.TokenStore
import dev.envpilot.jetbrains.auth.adoptableToken
import dev.envpilot.jetbrains.auth.needsRefresh
import dev.envpilot.jetbrains.auth.toSession
import dev.envpilot.jetbrains.auth.withRefresh
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class AuthSessionTest {
    private val gson = com.google.gson.Gson()

    private fun token(payload: Map<String, Any?>): String {
        fun b64(s: String) = Base64.getUrlEncoder().withoutPadding().encodeToString(s.toByteArray())
        val header = b64("""{"alg":"RS256","typ":"JWT"}""")
        return "$header.${b64(gson.toJson(payload))}.sig"
    }

    @Test
    fun `refresh keeps current token when response omits rotation`() {
        val current = Session("user_1", "a@example.com", "old-access", "old-refresh", "session_1")
        val response = AuthKitLogin.TokenResponse("new-access", null, null)

        assertEquals("old-refresh", current.withRefresh(response).refreshToken)
    }

    @Test
    fun `sign in stores WorkOS identity instead of token`() {
        val response =
            AuthKitLogin.TokenResponse(
                "access-token",
                "refresh-token",
                AuthKitLogin.WorkosUser("user_1", "a@example.com"),
            )

        val session = response.toSession()
        assertEquals("user_1", session.userId)
        assertEquals("a@example.com", session.email)
    }

    @Test
    fun `sign in falls back to the sub claim when WorkOS omits the user`() {
        val access = token(mapOf("sub" to "user_9", "exp" to System.currentTimeMillis() / 1000 + 600))

        val session = AuthKitLogin.TokenResponse(access, "refresh-token", null).toSession()
        assertEquals("user_9", session.userId)
        assertEquals("user_9", session.email)
    }

    @Test
    fun `a token already rotated by another caller is not refreshed again`() {
        val fresh = token(mapOf("exp" to System.currentTimeMillis() / 1000 + 600))
        val stale = token(mapOf("exp" to System.currentTimeMillis() / 1000 - 10))

        assertFalse(needsRefresh(fresh, force = false))
        assertTrue(needsRefresh(fresh, force = true))
        assertTrue(needsRefresh(stale, force = false))
    }

    @Test
    fun `a stored token newer than the cache is adopted instead of refreshed`() {
        val cached = Session("user_1", "a@example.com", token(mapOf("exp" to System.currentTimeMillis() / 1000 - 10)), "r1", null)
        val stored = cached.copy(accessToken = token(mapOf("exp" to System.currentTimeMillis() / 1000 + 600)), refreshToken = "r2")

        assertEquals(stored.accessToken, adoptableToken(cached, stored))
        assertNull(adoptableToken(cached, cached))
    }

    @Test
    fun `getFreshToken adopts a newer stored token instead of refreshing`() =
        runBlocking {
            val cached = Session("user_1", "a@example.com", token(mapOf("exp" to System.currentTimeMillis() / 1000 - 10)), "r1", null)
            val stored = cached.copy(accessToken = token(mapOf("exp" to System.currentTimeMillis() / 1000 + 600)), refreshToken = "r2")
            var saves = 0
            val service = AuthService(CoroutineScope(Dispatchers.Unconfined))
            service.store =
                object : TokenStore() {
                    override fun load(userId: String?): Session = stored

                    override fun save(session: Session) {
                        saves++
                    }
                }
            service.cached.set(cached)

            assertEquals(stored.accessToken, service.getFreshToken())
            assertEquals(stored, service.cached.get())
            assertEquals(0, saves)
        }

    @Test
    fun `only retryable WorkOS failures are transient`() {
        assertTrue(AuthKitLogin.isTransientFailure(408, null))
        assertTrue(AuthKitLogin.isTransientFailure(429, null))
        assertTrue(AuthKitLogin.isTransientFailure(503, null))
        assertFalse(AuthKitLogin.isTransientFailure(400, "invalid_grant"))
        assertFalse(AuthKitLogin.isTransientFailure(401, "unauthorized"))
    }
}
