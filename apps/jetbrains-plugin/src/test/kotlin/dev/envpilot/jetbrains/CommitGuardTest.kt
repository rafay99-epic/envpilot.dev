package dev.envpilot.jetbrains

import dev.envpilot.jetbrains.guards.CommitGuard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

class CommitGuardTest {
    @Test
    fun `install and remove preserve an existing hook`() {
        val root = Files.createTempDirectory("envpilot-guard")
        val hook = root.resolve(".git/hooks/pre-commit")
        Files.createDirectories(hook.parent)
        Files.writeString(hook, "#!/bin/sh\necho existing\n")

        assertTrue(CommitGuard.install(root.toString()))
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
        assertTrue(CommitGuard.install(root.toString()))
        assertTrue(Files.exists(gitDir.resolve("hooks/pre-commit")))
        assertTrue(CommitGuard.remove(root.toString()))
        assertFalse(Files.exists(gitDir.resolve("hooks/pre-commit")))
    }
}
