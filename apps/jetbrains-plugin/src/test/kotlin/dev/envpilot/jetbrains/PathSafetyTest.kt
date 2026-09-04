package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.sync.PullService
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assume
import org.junit.Test
import java.nio.file.Files

class PathSafetyTest {
    private fun tempDir(): java.nio.file.Path = Files.createTempDirectory("envpilot-path")

    @Test
    fun `normal relative path resolves inside`() {
        val dir = tempDir()
        val resolved = PullService.resolveWithin(dir, "sub/keystore.jks")
        assertNotNull(resolved)
        assertEquals(dir.toAbsolutePath().normalize().toString(), resolved!!.parent.parent.toString())
    }

    @Test
    fun `traversal is rejected`() {
        val dir = tempDir()
        assertNull(PullService.resolveWithin(dir, "../escape.txt"))
        assertNull(PullService.resolveWithin(dir, "a/../../escape.txt"))
        assertNull(PullService.resolveWithin(dir, ""))
    }

    @Test
    fun `symlink pointing outside the directory is rejected`() {
        val dir = tempDir()
        val outside = Files.createTempDirectory("envpilot-outside")
        try {
            Files.createSymbolicLink(dir.resolve("escape"), outside)
        } catch (e: Exception) {
            Assume.assumeNoException("filesystem cannot create symlinks", e)
        }
        assertNull(PullService.resolveWithin(dir, "escape/secret.txt"))
    }

    @Test
    fun `backslash separators are normalized`() {
        val dir = tempDir()
        val resolved = PullService.resolveWithin(dir, "a\\b.txt")
        assertNotNull(resolved)
        assertEquals(dir.toAbsolutePath().normalize().resolve("a/b.txt").toString(), resolved!!.toString())
    }
}
