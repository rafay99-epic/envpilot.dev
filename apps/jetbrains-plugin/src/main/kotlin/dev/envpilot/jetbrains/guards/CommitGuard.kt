package dev.envpilot.jetbrains.guards

import com.intellij.openapi.diagnostic.logger
import java.io.File
import java.nio.file.Files
import java.nio.file.Path

/**
 * Installs a git pre-commit hook that blocks commits touching the managed
 * env file unless ENVPILOT_ALLOW_COMMIT=1. Same hook block approach as the
 * VS Code extension — plain sh, zero platform coupling.
 */
object CommitGuard {
    private val log = logger<CommitGuard>()
    const val START = "# >>> ENVPILOT COMMIT GUARD >>>"
    const val END = "# <<< ENVPILOT COMMIT GUARD <<<"

    /** @return true when the hook is (or already was) installed. */
    fun install(
        projectRoot: String,
        targetFile: String,
    ): Boolean {
        val gitDir = findGitDir(Path.of(projectRoot)) ?: return false
        val hook = gitDir.resolve("hooks/pre-commit")
        Files.createDirectories(hook.parent)
        val existing = if (Files.exists(hook)) Files.readString(hook) else "#!/bin/sh\n"
        if (existing.contains(START)) return true
        var content = existing
        if (!content.startsWith("#!")) content = "#!/bin/sh\n$content"
        content += "\n" + START + "\n" +
            "ENVPILOT_TARGET=\"$targetFile\"\n" +
            "if git diff --cached --name-only 2>/dev/null | grep -qE \"(^|/)\$ENVPILOT_TARGET\$\"; then\n" +
            "  if [ \"\$ENVPILOT_ALLOW_COMMIT\" = \"1\" ]; then\n" +
            "    exit 0\n" +
            "  fi\n" +
            "  echo \"Envpilot commit guard: '\$ENVPILOT_TARGET' is staged.\"\n" +
            "  echo \"Re-run with ENVPILOT_ALLOW_COMMIT=1 to commit it anyway.\"\n" +
            "  exit 1\n" +
            "fi\n" +
            END + "\n"
        Files.writeString(hook, content)
        File(hook.toString()).setExecutable(true)
        log.info("Commit guard installed at $hook for $targetFile")
        return true
    }

    internal fun findGitDir(root: Path): Path? {
        var dir: Path? = root.toAbsolutePath().normalize()
        while (dir != null) {
            val candidate = dir.resolve(".git")
            if (Files.exists(candidate)) return if (Files.isDirectory(candidate)) candidate else dir
            dir = dir.parent
        }
        return null
    }

    fun hookSnippetForTests(targetFile: String): String =
        "if git diff --cached --name-only | grep -qE \"(^|/)$targetFile\$\"; then exit 1; fi"
}
