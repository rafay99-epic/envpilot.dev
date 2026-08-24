package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.version.VersionCheck
import org.junit.Assert.assertEquals
import org.junit.Test

class VersionCompareTest {
    @Test
    fun `equal versions`() {
        assertEquals(0, VersionCheck.compareVersions("1.2.3", "1.2.3"))
    }

    @Test
    fun `major minor patch ordering`() {
        assertEquals(-1, VersionCheck.compareVersions("1.2.3", "1.3.0"))
        assertEquals(1, VersionCheck.compareVersions("2.0.0", "1.9.9"))
        assertEquals(-1, VersionCheck.compareVersions("1.0.0", "1.0.1"))
    }

    @Test
    fun `missing segments count as zero`() {
        assertEquals(0, VersionCheck.compareVersions("1.2", "1.2.0"))
        assertEquals(-1, VersionCheck.compareVersions("1", "1.0.1"))
    }

    @Test
    fun `pre-release suffix ignored`() {
        assertEquals(0, VersionCheck.compareVersions("1.2.3-beta.1", "1.2.3"))
    }
}
