package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.access.PluginAccess
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.model.FeatureGate
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PluginAccessTest {
    private fun denied() = FeatureGate(allowed = false, reason = "nope", tierName = "free")

    private fun granted() = FeatureGate(allowed = true, reason = null, tierName = "pro")

    @Before
    fun reset() = PluginAccess.invalidate()

    @Test
    fun `an explicit denial closes the gate`() =
        runBlocking {
            val gate = PluginAccess.check("org_denied") { denied() }
            assertFalse(gate.allowed)
        }

    @Test
    fun `a transport failure fails open`() =
        runBlocking {
            val gate = PluginAccess.check("org_offline") { error("socket closed") }
            assertTrue("an offline IDE must keep syncing", gate.allowed)
        }

    @Test
    fun `a link with no organization id fails open`() =
        runBlocking {
            var calls = 0
            val gate =
                PluginAccess.check("") {
                    calls++
                    denied()
                }
            assertTrue(gate.allowed)
            assertEquals("nothing to ask the server about", 0, calls)
        }

    @Test
    fun `answers are memoized per organization`() =
        runBlocking {
            var calls = 0
            repeat(3) {
                PluginAccess.check("org_cached") {
                    calls++
                    granted()
                }
            }
            assertEquals(1, calls)

            PluginAccess.invalidate()
            PluginAccess.check("org_cached") {
                calls++
                granted()
            }
            assertEquals("invalidate() must force a re-read", 2, calls)
        }

    @Test
    fun `a registry that has never heard of the key fails open`() =
        runBlocking {
            val gate =
                PluginAccess.check("org_unseeded") {
                    // checkFeature's answer for a missing or inactive row — a
                    // backend that has not run the seed migration yet.
                    FeatureGate(allowed = false, reason = null, tierName = ConvexApi.UNKNOWN_TIER)
                }
            assertTrue("an unseeded backend must not lock every organization out", gate.allowed)
        }

    @Test
    fun `a failed fetch is not cached`() =
        runBlocking {
            PluginAccess.check("org_flaky") { error("socket closed") }
            val gate = PluginAccess.check("org_flaky") { denied() }
            assertFalse("the retry must reach the server, not a cached fail-open", gate.allowed)
        }
}
