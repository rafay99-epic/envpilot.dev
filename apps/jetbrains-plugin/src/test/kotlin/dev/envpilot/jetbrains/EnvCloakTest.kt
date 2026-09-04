package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.editor.EnvCloak
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EnvCloakTest {
    private fun folded(
        text: String,
        vararg keys: String,
    ): List<String> = EnvCloak.foldRanges(text, keys.toSet()).map { text.substring(it.first, it.last + 1) }

    @Test
    fun `folds the whole quoted value`() {
        // EnvFiles.quote escapes newlines, so a multi-line secret is one physical line.
        val text = "API_KEY=\"line1\\nline2\"\nPORT=3000\n"
        assertEquals(listOf("\"line1\\nline2\""), folded(text, "API_KEY"))
    }

    @Test
    fun `leaves unmanaged keys alone`() {
        assertTrue(folded("OTHER=value\n", "API_KEY").isEmpty())
    }

    @Test
    fun `leaves comments and empty values alone`() {
        assertTrue(folded("# API_KEY=secret\n", "API_KEY").isEmpty())
        assertTrue(folded("API_KEY=\n", "API_KEY").isEmpty())
    }
}
