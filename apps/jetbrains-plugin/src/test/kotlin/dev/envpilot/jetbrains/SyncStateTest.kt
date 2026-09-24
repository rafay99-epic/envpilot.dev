package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.sync.SyncState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SyncStateTest {
    @Test
    fun `one project's success does not clear another's error`() {
        SyncState.markFailure("isolation-a", "boom")
        SyncState.markSuccess("isolation-b")
        assertEquals("boom", SyncState.lastError("isolation-a"))
        assertNull(SyncState.lastError("isolation-b"))
    }

    @Test
    fun `syncing is tracked per project`() {
        SyncState.markStart("syncing-a")
        SyncState.markSuccess("syncing-b")
        assertTrue(SyncState.syncing("syncing-a"))
        SyncState.markSuccess("syncing-a")
        assertFalse(SyncState.syncing("syncing-a"))
    }

    @Test
    fun `success clears that project's error`() {
        SyncState.markFailure("clear-a", "boom")
        SyncState.markSuccess("clear-a")
        assertNull(SyncState.lastError("clear-a"))
    }
}
