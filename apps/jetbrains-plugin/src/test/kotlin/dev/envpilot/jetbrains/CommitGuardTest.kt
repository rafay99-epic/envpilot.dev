package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.guards.CommitGuard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume
import org.junit.Test
import java.nio.file.Files

class CommitGuardTest {
    @Test
    fun `install and remove preserve an existing hook`() {
        val root = Files.createTempDirectory("envpilot-guard")
        val hook = root.resolve(".git/hooks/pre-commit")
        Files.createDirectories(hook.parent)
        Files.writeString(hook, "#!/bin/sh\necho existing\n")

        assertTrue(CommitGuard.install(root.toString(), emptyList()))
        assertTrue(Files.readString(hook).contains(CommitGuard.START))
        assertTrue(CommitGuard.remove(root.toString()))
        assertEquals("#!/bin/sh\necho existing\n", Files.readString(hook))
    }

    @Test
    fun `worktree git pointer resolves the real git directory`() {
        val parent = Files.createTempDirectory("envpilot-worktree")
        val root = Files.createDirectory(parent.resolve("worktree"))
        val gitDir = Files.createDirectories(parent.resolve("repo/.git/worktrees/feature"))
        Files.writeString(root.resolve(".git"), "gitdir: ${root.relativize(gitDir)}\n")

        assertEquals(gitDir.normalize(), CommitGuard.findGitDir(root))
        assertTrue(CommitGuard.install(root.toString(), emptyList()))
        assertTrue(Files.exists(gitDir.resolve("hooks/pre-commit")))
        assertTrue(CommitGuard.remove(root.toString()))
        assertFalse(Files.exists(gitDir.resolve("hooks/pre-commit")))
    }

    @Test
    fun `a tracked hooks dir from core hooksPath is left alone`() {
        val root = Files.createTempDirectory("envpilot-husky")

        fun git(vararg args: String) = ProcessBuilder("git", "-C", root.toString(), *args).start().waitFor()
        Assume.assumeTrue(runCatching { git("init", "-q") }.getOrDefault(-1) == 0)
        git("config", "core.hooksPath", ".husky")
        val hook = Files.createDirectories(root.resolve(".husky")).resolve("pre-commit")
        Files.writeString(hook, "npx lint-staged\n")

        assertFalse(CommitGuard.install(root.toString(), emptyList()))
        assertEquals("npx lint-staged\n", Files.readString(hook))
    }

    @Test
    fun `hook blocks env and managed files but not templates or deletions`() {
        val root = Files.createTempDirectory("envpilot-hook").toRealPath()

        val identity = arrayOf("-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false")

        fun git(vararg args: String) =
            ProcessBuilder("git", *identity, "-C", root.toString(), *args)
                .redirectErrorStream(true)
                .start()
                .waitFor()
        Assume.assumeTrue(runCatching { git("init", "-q") }.getOrDefault(-1) == 0)
        git("config", "core.hooksPath", ".git/hooks")
        Files.writeString(root.resolve(".env.local"), "A=1\n")
        git("add", ".env.local")
        assertEquals(0, git("commit", "-qm", "tracked before the guard"))
        val secret = Files.createDirectories(root.resolve("certs")).resolve("key.pem")
        Files.writeString(secret, "k")
        Files.writeString(root.resolve(".env.example"), "A=\n")
        Files.writeString(root.resolve(".env.dist"), "A=\n")
        assertTrue(CommitGuard.install(root.toString(), listOf(secret.toString())))

        git("add", ".env.example", ".env.dist")
        assertEquals(0, git("commit", "-qm", "templates"))
        git("add", "certs/key.pem")
        assertTrue(git("commit", "-qm", "secret") != 0)
        git("reset", "-q", "certs/key.pem")
        Files.writeString(root.resolve(".env.local"), "A=2\n")
        git("add", ".env.local")
        assertTrue(git("commit", "-qm", "env") != 0)
        git("rm", "-q", "--cached", ".env.local")
        assertEquals(0, git("commit", "-qm", "untrack env"))
    }
}
