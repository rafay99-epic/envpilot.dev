package dev.envpilot.jetbrains.sync

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/**
 * .env file merging and atomic writes.
 * Merge preserves comments and unknown keys; pulled keys are updated in place
 * or appended. Port of the extension's env-file semantics (simplified to the
 * KEY=VALUE subset both clients share).
 */
object EnvFiles {
    data class Entry(val key: String, val value: String)

    fun parse(content: String): List<Entry> =
        content.lineSequence().mapNotNull { line ->
            val trimmed = line.trimStart()
            if (trimmed.isEmpty() || trimmed.startsWith("#")) return@mapNotNull null
            val eq = line.indexOfFirst { it == '=' }
            if (eq <= 0) return@mapNotNull null
            val key = line.substring(0, eq).trim()
            if (!key.matches(Regex("[A-Za-z_][A-Za-z0-9_.]*"))) return@mapNotNull null
            Entry(key, line.substring(eq + 1).trim())
        }.toList()

    fun merge(
        existingContent: String?,
        pulled: Map<String, String>,
    ): String {
        if (existingContent == null) {
            return pulled.entries.joinToString("\n") { "${it.key}=${it.value}" } + "\n"
        }
        val lines = existingContent.lines().toMutableList()
        val seen = mutableSetOf<String>()
        var i = 0
        while (i < lines.size) {
            val entry =
                parse(lines[i]).firstOrNull() ?: run {
                    i++
                    continue
                }
            // Update every occurrence: dotenv semantics let the LAST duplicate
            // win, so leaving a stale later line would resurrect old values.
            if (entry.key in pulled) {
                lines[i] = "${entry.key}=${pulled[entry.key]}"
                seen.add(entry.key)
            }
            i++
        }
        val missing = pulled.filterKeys { it !in seen }
        if (missing.isNotEmpty()) {
            if (lines.lastOrNull()?.isNotBlank() == true) lines.add("")
            missing.forEach { (k, v) -> lines.add("$k=$v") }
        }
        return lines.joinToString("\n")
    }

    enum class ConflictMode(val id: String) {
        MERGE("merge"),
        OVERWRITE("overwrite"),
        BACKUP("backup"),
        ;

        companion object {
            fun from(id: String?): ConflictMode = entries.firstOrNull { it.id == id } ?: MERGE
        }
    }

    /**
     * Resolve existing file content against pulled values per mode:
     *  - merge: preserve comments/unknown keys, update managed keys (default)
     *  - overwrite: file becomes exactly the pulled set
     *  - backup: like merge, but the previous content is kept as <file>.envpilot-bak
     */
    fun resolve(
        existingContent: String?,
        pulled: Map<String, String>,
        mode: ConflictMode,
    ): String {
        if (existingContent == null) return merge(null, pulled)
        return when (mode) {
            ConflictMode.OVERWRITE -> merge(null, pulled)
            else -> merge(existingContent, pulled)
        }
    }

    fun backupPath(target: Path): Path = target.resolveSibling(target.fileName.toString() + ".envpilot-bak")

    /** Atomic temp+rename write; skips the write when content is unchanged. */
    fun atomicWrite(
        target: Path,
        content: String,
    ) {
        if (readIfExists(target) == content) return
        target.parent?.let { Files.createDirectories(it) }
        val tmp = Files.createTempFile(target.parent, ".envpilot-", ".tmp")
        try {
            Files.write(tmp, content.toByteArray(StandardCharsets.UTF_8))
            try {
                Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
            } catch (_: Exception) {
                Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            Files.deleteIfExists(tmp)
        }
    }

    fun readIfExists(path: Path): String? = if (Files.exists(path)) Files.readAllLines(path).joinToString("\n") else null
}
