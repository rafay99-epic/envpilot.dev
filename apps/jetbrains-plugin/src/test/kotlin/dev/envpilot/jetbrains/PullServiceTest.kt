package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.model.PullMeta
import dev.envpilot.jetbrains.model.PullResult
import dev.envpilot.jetbrains.model.PulledVariable
import dev.envpilot.jetbrains.sync.EnvFiles
import dev.envpilot.jetbrains.sync.PullService
import org.junit.After
import org.junit.Assume
import org.junit.Test
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull

class PullServiceTest {
    private val roots = mutableListOf<Path>()

    @After
    fun cleanup() {
        roots.forEach { it.toFile().deleteRecursively() }
        roots.clear()
    }

    private fun dir(): Path = Files.createTempDirectory("envpilot-pull").also { roots.add(it) }

    private fun meta(
        truncatedAt: Int? = null,
        failures: List<String>? = null,
    ) = PullMeta(failures, "owner", null, truncatedAt, true, emptyMap())

    private fun result(
        meta: PullMeta,
        values: Map<String, String> = mapOf("A" to "1"),
    ) = PullResult(values.map { PulledVariable(it.key, it.value, listOf("development"), false) }, meta)

    /** Mirrors pull()'s order: guard first, write second. */
    private fun guardThenWrite(
        root: Path,
        pulled: PullResult,
    ) {
        PullService.abortIfIncomplete(pulled)
        PullService.writeFiles(root.resolve(".env.local"), "A=1\n", null, EnvFiles.ConflictMode.MERGE, emptyList(), null)
    }

    @Test
    fun `a failed secret write rolls the env file and earlier secrets back`() {
        val root = dir()
        Assume.assumeTrue(root.fileSystem.supportedFileAttributeViews().contains("posix"))
        val env = root.resolve(".env.local")
        Files.writeString(env, "OLD=1\n")
        val first = root.resolve("first.txt")
        Files.write(first, "old-first".toByteArray())
        val locked = Files.createDirectory(root.resolve("locked"))
        val second = locked.resolve("second.txt")
        Files.setPosixFilePermissions(locked, PosixFilePermissions.fromString("r-xr-xr-x"))

        val failure =
            assertFailsWith<PullService.PullAborted> {
                PullService.writeFiles(
                    env,
                    "NEW=2\n",
                    "OLD=1\n",
                    EnvFiles.ConflictMode.MERGE,
                    listOf(
                        PullService.SecretWrite("new-first".toByteArray(), first, null),
                        PullService.SecretWrite("new-second".toByteArray(), second, null),
                    ),
                    listOf(first.toString()),
                )
            }

        Files.setPosixFilePermissions(locked, PosixFilePermissions.fromString("rwxr-xr-x"))
        assertNotNull(failure.cause)
        assertEquals("OLD=1\n", Files.readString(env))
        assertEquals("old-first", Files.readString(first))
        assertFalse(Files.exists(second))
    }

    @Test
    fun `a truncated result aborts before anything is written`() {
        val root = dir()
        assertFailsWith<PullService.PullAborted> { guardThenWrite(root, result(meta(truncatedAt = 500))) }
        assertEquals(0, Files.list(root).use { it.count() }.toInt())
    }

    @Test
    fun `a decryption failure aborts before anything is written`() {
        val root = dir()
        assertFailsWith<PullService.PullAborted> { guardThenWrite(root, result(meta(failures = listOf("A")))) }
        assertFailsWith<PullService.PullAborted> {
            guardThenWrite(root, result(meta(), mapOf("A" to "[DECRYPTION_FAILED]")))
        }
        assertEquals(0, Files.list(root).use { it.count() }.toInt())
    }

    @Test
    fun `a foreign file at a secret destination is backed up before being overwritten`() {
        val root = dir()
        val secret = root.resolve("keystore.jks")
        Files.write(secret, "theirs".toByteArray())

        PullService.writeFiles(
            root.resolve(".env.local"),
            "A=1\n",
            null,
            EnvFiles.ConflictMode.MERGE,
            listOf(PullService.SecretWrite("ours".toByteArray(), secret, null)),
            previousManagedSecrets = null,
        )

        assertEquals("ours", Files.readString(secret))
        assertEquals("theirs", Files.readString(root.resolve("keystore.jks.envpilot-bak")))
    }
}
