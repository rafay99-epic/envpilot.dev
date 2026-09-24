package dev.envpilot.jetbrains.guards

import com.intellij.openapi.diagnostic.logger
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

object CommitGuard {
    private val log = logger<CommitGuard>()
    const val START = "# >>> ENVPILOT COMMIT GUARD >>>"
    const val END = "# <<< ENVPILOT COMMIT GUARD <<<"
    private const val STAGED = "git diff --cached --name-only --diff-filter=ACMR 2>/dev/null"
    private const val ENV_CHECK = "$STAGED | grep -E '(^|/)\\.env($|\\.)' | grep -qvE '\\.env\\.(example|sample|template|dist)$'"

    internal fun block(stagedPaths: List<String>): String {
        val managed = stagedPaths.joinToString("") { " -e '${it.replace("'", "'\\''")}'" }
        val check = if (stagedPaths.isEmpty()) ENV_CHECK else "$ENV_CHECK || $STAGED | grep -qxF$managed"
        return START + "\n" +
            "if $check; then\n" +
            "  if [ \"\$ENVPILOT_ALLOW_COMMIT\" != \"1\" ]; then\n" +
            "    echo \"Envpilot commit guard: an env or Envpilot-managed file is staged.\"\n" +
            "    echo \"Re-run with ENVPILOT_ALLOW_COMMIT=1 to commit it anyway.\"\n" +
            "    exit 1\n" +
            "  fi\n" +
            "fi\n" +
            END
    }

    fun install(
        projectRoot: String,
        managedPaths: Collection<String>,
    ): Boolean {
        val root = Path.of(projectRoot)
        val configured = configuredHooksDir(root)
        if (configured != null && configured.none { it.toString() == ".git" }) return false
        val hook = hooksDir(root)?.resolve("pre-commit") ?: return false
        val block = block(repoRelative(root, managedPaths))
        Files.createDirectories(hook.parent)
        val existing = if (Files.exists(hook)) Files.readString(hook) else "#!/bin/sh\n"
        val markerStart = existing.indexOf(START)
        val markerEnd = existing.indexOf(END, markerStart.coerceAtLeast(0))
        if (markerStart >= 0 && markerEnd >= 0) {
            val updated = existing.substring(0, markerStart) + block + existing.substring(markerEnd + END.length)
            if (updated != existing) Files.writeString(hook, updated)
            File(hook.toString()).setExecutable(true)
            return true
        }
        var content = existing
        if (!content.startsWith("#!")) content = "#!/bin/sh\n$content"
        content += "\n$block\n"
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

    internal fun configuredHooksDir(root: Path): Path? =
        git(root, "config", "--path", "core.hooksPath")?.let { root.toAbsolutePath().normalize().resolve(it).normalize() }

    private fun hooksDir(root: Path): Path? =
        git(root, "rev-parse", "--path-format=absolute", "--git-path", "hooks")?.let { Path.of(it).normalize() }
            ?: findGitDir(root)?.resolve("hooks")

    private fun repoRelative(
        root: Path,
        paths: Collection<String>,
    ): List<String> {
        val top = git(root, "rev-parse", "--show-toplevel")?.let { Path.of(it) } ?: return emptyList()
        return paths.mapNotNull { path ->
            runCatching { top.relativize(Path.of(path).toRealPath()) }.getOrNull()
                ?.takeIf { !it.startsWith("..") }
                ?.toString()
                ?.replace('\\', '/')
        }.sorted()
    }

    private fun git(
        root: Path,
        vararg args: String,
    ): String? {
        val process =
            runCatching {
                ProcessBuilder("git", "-C", root.toString(), *args).redirectErrorStream(true).start()
            }.getOrNull() ?: return null
        if (!process.waitFor(5, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            return null
        }
        val output = process.inputStream.bufferedReader().readText().trim()
        return output.takeIf { process.exitValue() == 0 && it.isNotBlank() }
    }
}
