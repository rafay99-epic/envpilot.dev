package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.editor.EnvEditorService
import org.junit.Test
import java.nio.file.Files
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class EnvEditorServiceTest {
    @Test
    fun `a backslash path is found by its forward slash VirtualFile path`() {
        val service = EnvEditorService()
        service.recordSync(
            "C:\\work\\app\\.env.local",
            setOf("API_KEY"),
            "hash",
            listOf("C:\\work\\app\\keys\\id.pem"),
            mapOf("C:\\work\\app\\keys\\id.pem" to "secret-hash"),
        )

        val managed = assertNotNull(service.managed("C:/work/app/.env.local"))
        assertEquals(listOf("C:/work/app/keys/id.pem"), managed.secretFilePaths)
        assertEquals("secret-hash", service.expectedHashes()["C:/work/app/keys/id.pem"])
    }

    @Test
    fun `cached keys are per environment`() {
        val service = EnvEditorService()
        service.cacheKeys("p1", "development", setOf("DEV_ONLY"))

        assertEquals(setOf("DEV_ONLY"), service.cachedKeys("p1", "development"))
        assertNull(service.cachedKeys("p1", "production"))
    }

    @Test
    fun `a file recorded through a symlinked directory is found by its real path`() {
        val real = Files.createTempDirectory("envpilot-real")
        val link = Files.createTempDirectory("envpilot-link").resolve("app")
        Files.createSymbolicLink(link, real)
        val target = real.resolve(".env.local")
        Files.writeString(target, "A=1\n")
        val service = EnvEditorService()
        service.recordSync(link.resolve(".env.local").toString(), setOf("A"), "hash")

        assertNotNull(service.managed(target.toRealPath().toString()))
        assertNotNull(service.managed(link.resolve(".env.local").toString()))
    }

    @Test
    fun `state persisted under a symlinked path is found by its real path after load`() {
        val real = Files.createTempDirectory("envpilot-real").toRealPath()
        val link = Files.createTempDirectory("envpilot-link").resolve("app")
        Files.createSymbolicLink(link, real)
        val secret = link.resolve("id.pem").toString()
        val realSecret = real.resolve("id.pem").toString()
        val realOlderSecret = real.resolve("legacy.pem").toString()
        val service = EnvEditorService()
        service.loadState(
            EnvEditorService.State().apply {
                managed =
                    mutableMapOf(
                        link.resolve(".env.local").toString() to
                            EnvEditorService.ManagedFileState(
                                syncedHash = "new",
                                syncedAtMs = 2,
                                secretFilePaths = listOf(secret),
                                secretHashes = mapOf(secret to "secret-hash"),
                            ),
                        real.resolve(".env.local").toString() to
                            EnvEditorService.ManagedFileState(
                                syncedHash = "old",
                                syncedAtMs = 1,
                                secretFilePaths = listOf(realOlderSecret),
                                secretHashes = mapOf(realOlderSecret to "older-hash"),
                            ),
                    )
            },
        )

        val managed = assertNotNull(service.managed(real.resolve(".env.local").toString()))
        assertEquals("new", managed.syncedHash)
        assertEquals(setOf(realSecret, realOlderSecret), managed.secretFilePaths.toSet())
        assertEquals("secret-hash", managed.secretHashes[realSecret])
        assertEquals("older-hash", managed.secretHashes[realOlderSecret])
        assertEquals(1, service.managedPaths().size)
    }
}
