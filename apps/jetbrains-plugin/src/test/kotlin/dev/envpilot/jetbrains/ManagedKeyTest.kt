package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.editor.resolveManagedKey
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ManagedKeyTest {
    private val managed = setOf("API_KEY")

    private fun resolve(
        line: String,
        column: Int = 0,
        isEnvFile: Boolean = true,
    ) = resolveManagedKey(line, column, isEnvFile, managed)

    @Test
    fun `resolves with the caret on the key or on the value`() {
        assertEquals("API_KEY", resolve("API_KEY=secret", column = 2))
        assertEquals("API_KEY", resolve("API_KEY=secret", column = 11))
    }

    @Test
    fun `handles export prefixes and leading whitespace`() {
        assertEquals("API_KEY", resolve("  export API_KEY=secret", column = 12))
    }

    @Test
    fun `ignores comments, blanks and unmanaged keys`() {
        assertNull(resolve("# API_KEY=secret"))
        assertNull(resolve(""))
        assertNull(resolve("   "))
        assertNull(resolve("OTHER=secret"))
    }

    @Test
    fun `falls back to code references outside env files`() {
        val line = "const url = process.env.API_KEY"
        assertEquals("API_KEY", resolveManagedKey(line, line.indexOf("API_KEY"), false, managed))
        assertNull(resolveManagedKey("API_KEY=secret", 0, false, managed))
    }
}
