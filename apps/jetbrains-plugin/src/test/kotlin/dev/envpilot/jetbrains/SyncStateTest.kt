package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.sync.SyncState
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SyncStateTest {
    @BeforeTest
    @AfterTest
    fun reset() = SyncState.reset()

    @Test
    fun `one project's success does not clear another's error`() {
        SyncState.markFailureFor("a", "boom")
        SyncState.markSuccessFor("b")
        assertEquals("boom", SyncState.lastError)
    }

    @Test
    fun `syncing is true while any project syncs`() {
        SyncState.markStartFor("a")
        SyncState.markSuccessFor("b")
        assertTrue(SyncState.syncing)
        SyncState.markSuccessFor("a")
        assertFalse(SyncState.syncing)
    }

    @Test
    fun `success clears that project's error and stamps the sync time`() {
        SyncState.markFailureFor("a", "boom")
        SyncState.markSuccessFor("a")
        assertNull(SyncState.lastError)
        assertTrue(SyncState.lastSyncAtMs > 0)
    }
}
