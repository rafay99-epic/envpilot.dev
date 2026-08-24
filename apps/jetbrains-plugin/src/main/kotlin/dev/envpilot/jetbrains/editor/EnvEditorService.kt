package dev.envpilot.jetbrains.editor

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Project-level state for editor integrations: which files Envpilot manages,
 * the decrypted values (in memory only, never persisted), the last synced
 * content hash, cached variable metadata for completion, and cloak/reveal
 * state. Port of the extension's cloakRanges/unsyncState concepts.
 */
@Service(Service.Level.PROJECT)
class EnvEditorService {

    data class ManagedFile(
        val keys: Set<String>,
        val values: Map<String, String>,
        val syncedHash: String,
        val syncedAtMs: Long,
        val secretFilePaths: List<String> = emptyList(),
        val secretHashes: Map<String, String> = emptyMap(),
    )

    enum class LinkStatus { SYNCED, DRIFTED, NOT_PULLED }

    private val managed = ConcurrentHashMap<String, ManagedFile>()

    // Cached metadata-only key lists per project, for completion.
    private val metadataCache = ConcurrentHashMap<String, Pair<Long, Set<String>>>()
    private val filesCache = ConcurrentHashMap<String, Pair<Long, List<dev.envpilot.jetbrains.model.SecretFileMeta>>>()
    private val metadataTtlMs = 30_000L

    @Volatile var revealUntilMs: Long = 0

    fun recordSync(
        path: String,
        keys: Set<String>,
        values: Map<String, String>,
        hash: String,
        secretFilePaths: List<String> = emptyList(),
        secretHashes: Map<String, String> = emptyMap(),
    ) {
        managed[path] = ManagedFile(keys, values, hash, System.currentTimeMillis(), secretFilePaths, secretHashes)
    }

    /** Every secret file path Envpilot wrote, across all managed entries. */
    fun allTrackedSecretFiles(): List<String> =
        managed.values.flatMap { it.secretFilePaths }

    /** Status of a linked directory's env file, for tree icons/labels. */
    fun statusFor(targetFile: String): LinkStatus {
        val managed = managed[targetFile] ?: return LinkStatus.NOT_PULLED
        if (managed.syncedHash.isEmpty()) return LinkStatus.DRIFTED
        if (!java.nio.file.Files.exists(java.nio.file.Path.of(targetFile))) return LinkStatus.NOT_PULLED
        return LinkStatus.SYNCED
    }

    fun managed(path: String): ManagedFile? = managed[path]

    fun managedPaths(): Set<String> = managed.keys.toSet()

    fun markDrifted(path: String): Boolean {
        val current = managed[path] ?: return false
        managed[path] = current.copy(syncedHash = "")
        return true
    }

    fun isDrifted(path: String): Boolean = managed[path]?.syncedHash?.isEmpty() == true

    /** Metadata cache for secret files, keyed "projectId:environment". */
    fun cachedFiles(key: String): List<dev.envpilot.jetbrains.model.SecretFileMeta>? {
        val (at, metas) = filesCache[key] ?: return null
        return if (System.currentTimeMillis() - at < metadataTtlMs) metas else null
    }

    fun cacheFiles(key: String, metas: List<dev.envpilot.jetbrains.model.SecretFileMeta>) {
        filesCache[key] = System.currentTimeMillis() to metas
    }

    fun cachedKeys(projectId: String): Set<String>? {
        val (at, keys) = metadataCache[projectId] ?: return null
        return if (System.currentTimeMillis() - at < metadataTtlMs) keys else null
    }

    fun cacheKeys(projectId: String, keys: Set<String>) {
        metadataCache[projectId] = System.currentTimeMillis() to keys
    }

    fun revealFor(seconds: Long = 30) {
        revealUntilMs = System.currentTimeMillis() + seconds * 1000
    }

    fun isRevealed(): Boolean = System.currentTimeMillis() < revealUntilMs

    companion object {
        fun getInstance(project: Project): EnvEditorService =
            project.getService(EnvEditorService::class.java)
    }
}
