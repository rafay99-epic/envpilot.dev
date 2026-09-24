package dev.envpilot.jetbrains.sync

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.PosixFilePermission

object EnvFiles {
    private val KEY_REGEX = Regex("[A-Za-z_][A-Za-z0-9_.]*")

    private val NEEDS_QUOTING = Regex("[\\s#\"'`\$\\\\]|[\\x00-\\x1f]")

    private data class ParsedLine(val key: String, val exported: Boolean)

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

    private fun parseLine(line: String): ParsedLine? {
        val trimmed = line.trim()
        if (trimmed.isEmpty() || trimmed.startsWith("#")) return null
        val eq = trimmed.indexOf('=')
        if (eq <= 0) return null
        val rawKey = trimmed.substring(0, eq).trim()
        val exported = rawKey.startsWith("export ")
        val key = if (exported) rawKey.removePrefix("export ").trim() else rawKey
        if (!key.matches(KEY_REGEX)) return null
        return ParsedLine(key, exported)
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

    fun atomicWrite(
        target: Path,
        content: String,
    ) {
        if (readIfExists(target) == content) return
        atomicWrite(target, content.toByteArray(StandardCharsets.UTF_8), null)
    }

    fun atomicWrite(
        target: Path,
        bytes: ByteArray,
        permissions: Set<PosixFilePermission>?,
    ) {
        target.parent?.let { Files.createDirectories(it) }
        val tmp = Files.createTempFile(target.parent, ".envpilot-", ".tmp")
        try {
            Files.write(tmp, bytes)
            permissions?.let { Files.setPosixFilePermissions(tmp, it) }
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
