package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.editor.EnvKeyReferences
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class EnvKeyReferencesTest {
    @Test
    fun `finds keys across supported languages`() {
        val lines =
            listOf(
                "process.env.DATABASE_URL" to "DATABASE_URL",
                "os.getenv(\"API_KEY\")" to "API_KEY",
                "ENV['REDIS_URL']" to "REDIS_URL",
                "System.getenv(\"TOKEN\")" to "TOKEN",
                "std::env::var(\"PORT\")" to "PORT",
            )
        for ((line, key) in lines) {
            assertEquals(key, EnvKeyReferences.at(line, line.indexOf(key))?.key)
        }
    }

    @Test
    fun `ignores cursor outside key`() {
        assertNull(EnvKeyReferences.at("process.env.SECRET", 0))
    }
}
