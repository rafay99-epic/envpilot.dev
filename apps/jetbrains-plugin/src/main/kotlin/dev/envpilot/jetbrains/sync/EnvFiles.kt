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

    private val KEY_REGEX = Regex("[A-Za-z_][A-Za-z0-9_.]*")

    // Same rule as the VS Code extension's formatValue: anything that dotenv
    // parsers would mis-read has to be double-quoted and escaped.
    private val NEEDS_QUOTING = Regex("[\\s#\"'`\$\\\\]|[\\x00-\\x1f]")

    private data class ParsedLine(val key: String, val value: String, val exported: Boolean)

    fun quote(value: String): String =
        if (NEEDS_QUOTING.containsMatchIn(value)) {
            val escaped =
                value
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t")
            "\"$escaped\""
        } else {
            value
        }

    fun parse(content: String): List<Entry> =
        content.lineSequence()
            .mapNotNull { parseLine(it) }
            .map { Entry(it.key, it.value) }
            .toList()

    private fun parseLine(line: String): ParsedLine? {
        val trimmed = line.trim()
        if (trimmed.isEmpty() || trimmed.startsWith("#")) return null
        val eq = trimmed.indexOf('=')
        if (eq <= 0) return null
        val rawKey = trimmed.substring(0, eq).trim()
        val exported = rawKey.startsWith("export ")
        val key = if (exported) rawKey.removePrefix("export ").trim() else rawKey
        if (!key.matches(KEY_REGEX)) return null
        return ParsedLine(key, unquote(trimmed.substring(eq + 1).trim()), exported)
    }

    private fun unquote(raw: String): String =
        when {
            raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') -> unescape(raw.substring(1, raw.length - 1))
            raw.length >= 2 && raw.startsWith('\'') && raw.endsWith('\'') -> raw.substring(1, raw.length - 1)
            else -> raw
        }

    private fun unescape(s: String): String {
        val out = StringBuilder(s.length)
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '\\' && i + 1 < s.length) {
                i++
                out.append(
                    when (val next = s[i]) {
                        'n' -> '\n'
                        'r' -> '\r'
                        't' -> '\t'
                        else -> next
                    },
                )
            } else {
                out.append(c)
            }
            i++
        }
        return out.toString()
    }

    fun merge(
        existingContent: String?,
        pulled: Map<String, String>,
    ): String {
        if (existingContent == null) {
            return pulled.entries.joinToString("\n") { "${it.key}=${quote(it.value)}" } + "\n"
        }
        val eol = if (existingContent.contains("\r\n")) "\r\n" else "\n"
        val lines = existingContent.lines().toMutableList()
        val seen = mutableSetOf<String>()
        var i = 0
        while (i < lines.size) {
            val entry =
                parseLine(lines[i]) ?: run {
                    i++
                    continue
                }
            // Update every occurrence: dotenv semantics let the LAST duplicate
            // win, so leaving a stale later line would resurrect old values.
            if (entry.key in pulled) {
                val prefix = if (entry.exported) "export " else ""
                lines[i] = "$prefix${entry.key}=${quote(pulled.getValue(entry.key))}"
                seen.add(entry.key)
            }
            i++
        }
        val missing = pulled.filterKeys { it !in seen }
        if (missing.isNotEmpty()) {
            if (lines.lastOrNull()?.isNotBlank() == true) lines.add("")
            missing.forEach { (k, v) -> lines.add("$k=${quote(v)}") }
        }
        return lines.joinToString(eol)
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

    fun readIfExists(path: Path): String? = if (Files.exists(path)) Files.readString(path) else null
}
