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
    private const val BLOCK =
        START + "\n" +
            "if git diff --cached --name-only 2>/dev/null | grep -qE '(^|/)\\.env($|\\.)'; then\n" +
            "  if [ \"\$ENVPILOT_ALLOW_COMMIT\" != \"1\" ]; then\n" +
            "    echo \"Envpilot commit guard: an .env file is staged.\"\n" +
            "    echo \"Re-run with ENVPILOT_ALLOW_COMMIT=1 to commit it anyway.\"\n" +
            "    exit 1\n" +
            "  fi\n" +
            "fi\n" +
            END

    /** @return true when the hook is (or already was) installed. */
    fun install(projectRoot: String): Boolean {
        val hook = hooksDir(Path.of(projectRoot))?.resolve("pre-commit") ?: return false
        Files.createDirectories(hook.parent)
        val existing = if (Files.exists(hook)) Files.readString(hook) else "#!/bin/sh\n"
        val markerStart = existing.indexOf(START)
        val markerEnd = existing.indexOf(END, markerStart.coerceAtLeast(0))
        if (markerStart >= 0 && markerEnd >= 0) {
            val updated = existing.substring(0, markerStart) + BLOCK + existing.substring(markerEnd + END.length)
            Files.writeString(hook, updated)
            File(hook.toString()).setExecutable(true)
            return true
        }
        var content = existing
        if (!content.startsWith("#!")) content = "#!/bin/sh\n$content"
        content += "\n$BLOCK\n"
        Files.writeString(hook, content)
        File(hook.toString()).setExecutable(true)
        log.info("Commit guard installed at $hook")
        return true
    }

    fun remove(projectRoot: String): Boolean {
        val hook = hooksDir(Path.of(projectRoot))?.resolve("pre-commit") ?: return false
        if (!Files.exists(hook)) return false
        val existing = Files.readString(hook)
        val start = existing.indexOf(START)
        if (start < 0) return false
        val end = existing.indexOf(END, start)
        if (end < 0) return false
        val cleaned =
            (existing.substring(0, start) + existing.substring(end + END.length))
                .replace(Regex("\\n{3,}"), "\n\n")
                .trim()
        if (cleaned.isEmpty() || cleaned == "#!/bin/sh") {
            Files.deleteIfExists(hook)
        } else {
            Files.writeString(hook, "$cleaned\n")
        }
        log.info("Commit guard removed from $hook")
        return true
    }

    internal fun findGitDir(root: Path): Path? {
        var dir: Path? = root.toAbsolutePath().normalize()
        while (dir != null) {
            val candidate = dir.resolve(".git")
            if (Files.isDirectory(candidate)) return candidate
            if (Files.isRegularFile(candidate)) {
                val pointer = Files.readString(candidate).trim()
                if (pointer.startsWith("gitdir:")) {
                    return dir.resolve(pointer.removePrefix("gitdir:").trim()).normalize()
                }
            }
            dir = dir.parent
        }
        return null
    }

    private fun hooksDir(root: Path): Path? {
        val process =
            runCatching {
                ProcessBuilder("git", "-C", root.toString(), "rev-parse", "--path-format=absolute", "--git-path", "hooks")
                    .redirectErrorStream(true)
                    .start()
            }.getOrNull()
        if (process != null && process.waitFor() == 0) {
            val resolved = process.inputStream.bufferedReader().readText().trim()
            if (resolved.isNotBlank()) return Path.of(resolved).normalize()
        }
        return findGitDir(root)?.resolve("hooks")
    }
}
