package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.auth.AuthKitLogin
import dev.envpilot.jetbrains.auth.Session
import dev.envpilot.jetbrains.auth.toSession
import dev.envpilot.jetbrains.auth.withRefresh
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthSessionTest {
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
    fun `only retryable WorkOS failures are transient`() {
        assertTrue(AuthKitLogin.isTransientFailure(408, null))
        assertTrue(AuthKitLogin.isTransientFailure(429, null))
        assertTrue(AuthKitLogin.isTransientFailure(503, null))
        assertFalse(AuthKitLogin.isTransientFailure(400, "invalid_grant"))
        assertFalse(AuthKitLogin.isTransientFailure(401, "unauthorized"))
    }
}
