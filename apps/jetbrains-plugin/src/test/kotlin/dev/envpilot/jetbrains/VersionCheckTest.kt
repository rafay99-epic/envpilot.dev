package dev.envpilot.jetbrains

import com.google.gson.Gson
import com.google.gson.JsonObject
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.version.VersionCheck
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionCheckTest {
    private fun manifest(json: String): JsonObject = Gson().fromJson(json, JsonObject::class.java)

    @Test
    fun `a minimum above the current version latches outdated`() {
        assertFalse(VersionCheck.evaluate(manifest("""{"jetbrains":"1.5.0","minJetbrains":"1.4.0"}"""), "1.3.0"))
        assertTrue(AuthService.outdated)
    }

    @Test
    fun `a minimum below the current version clears the latch`() {
        VersionCheck.evaluate(manifest("""{"minJetbrains":"1.4.0"}"""), "1.3.0")

        assertTrue(VersionCheck.evaluate(manifest("""{"minJetbrains":"1.2.0"}"""), "1.3.0"))
        assertFalse(AuthService.outdated)
    }

    @Test
    fun `a manifest without a minimum clears the latch`() {
        VersionCheck.evaluate(manifest("""{"minJetbrains":"1.4.0"}"""), "1.3.0")

        assertTrue(VersionCheck.evaluate(manifest("""{"jetbrains":"1.5.0"}"""), "1.3.0"))
        assertFalse(AuthService.outdated)
    }
}
