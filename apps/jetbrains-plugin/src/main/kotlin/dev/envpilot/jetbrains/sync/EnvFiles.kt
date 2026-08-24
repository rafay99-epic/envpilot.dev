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

    fun merge(existingContent: String?, pulled: Map<String, String>): String {
        if (existingContent == null) {
            return pulled.entries.joinToString("\n") { "${it.key}=${it.value}" } + "\n"
        }
        val lines = existingContent.lines().toMutableList()
        val seen = mutableSetOf<String>()
        var i = 0
        while (i < lines.size) {
            val entry = parse(lines[i]).firstOrNull() ?: run { i++; continue }
            if (entry.key in pulled && entry.key !in seen) {
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

    /** Atomic temp+rename write; skips the write when content is unchanged. */
    fun atomicWrite(target: Path, content: String) {
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

    fun readIfExists(path: Path): String? =
        if (Files.exists(path)) Files.readAllLines(path).joinToString("\n") else null
}
