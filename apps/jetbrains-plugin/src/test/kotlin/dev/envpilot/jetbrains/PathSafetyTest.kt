package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.sync.PullService
import org.junit.Assume
import org.junit.Test
import java.nio.file.Files
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class PathSafetyTest {
    private fun tempDir(): java.nio.file.Path = Files.createTempDirectory("envpilot-path")

    @Test
    fun `normal relative path resolves inside`() {
        val dir = tempDir()
        val resolved = assertNotNull(PullService.resolveWithin(dir, "sub/keystore.jks"))
        assertEquals(dir.toAbsolutePath().normalize().toString(), resolved.parent.parent.toString())
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
        val resolved = assertNotNull(PullService.resolveWithin(dir, "a\\b.txt"))
        assertEquals(dir.toAbsolutePath().normalize().resolve("a/b.txt").toString(), resolved.toString())
    }

    @Test
    fun `env file, repo metadata and hooks dir are rejected`() {
        val dir = tempDir()
        val root = dir.toAbsolutePath().normalize()
        val blocked = listOf(root.resolve(".env.local"), root.resolve("githooks"))
        assertNull(PullService.resolveWithin(dir, ".env.local", blocked))
        assertNull(PullService.resolveWithin(dir, "githooks/pre-commit", blocked))
        assertNull(PullService.resolveWithin(dir, ".git/hooks/pre-commit", blocked))
        assertNull(PullService.resolveWithin(dir, "sub/.GIT/config", blocked))
        assertNull(PullService.resolveWithin(dir, ".husky/pre-commit", blocked))
        assertNull(PullService.resolveWithin(dir, ".idea/workspace.xml", blocked))
        assertNull(PullService.resolveWithin(dir, "a/.VSCODE/settings.json", blocked))
        assertNull(PullService.resolveWithin(dir, ".envpilot/state", blocked))
        assertNull(PullService.resolveWithin(dir, "config/.env.production", blocked))
        assertNull(PullService.resolveWithin(dir, "prod.env", blocked))
        assertNotNull(PullService.resolveWithin(dir, "certs/.envrc.pem", blocked))
    }
}
