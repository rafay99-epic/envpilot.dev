package dev.envpilot.jetbrains.editor

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import java.util.concurrent.ConcurrentHashMap

/**
 * Project-level state for editor integrations: which files Envpilot manages,
 * the last synced content hashes, cached variable metadata for completion,
 * and cloak/reveal state.
 *
 * Sync state is PERSISTED (hashes and key names only — never decrypted
 * values) so status icons, cloaking and the copy guard survive IDE restarts
 * without re-pulling.
 */
@Service(Service.Level.PROJECT)
@State(name = "EnvpilotEditorState", storages = [Storage("EnvpilotPlugin.xml")])
class EnvEditorService : PersistentStateComponent<EnvEditorService.State> {
    class ManagedFileState {
        var keys: List<String> = emptyList()
        var syncedHash: String = ""
        var syncedAtMs: Long = 0
        var secretFilePaths: List<String> = emptyList()
        var secretHashes: Map<String, String> = emptyMap()
    }

    class State {
        var managed: MutableMap<String, ManagedFileState> = mutableMapOf()
    }

    data class ManagedFile(
        val keys: Set<String>,
        val syncedHash: String,
        val syncedAtMs: Long,
        val secretFilePaths: List<String>,
        val secretHashes: Map<String, String>,
    ) {
        fun isDrifted(): Boolean = syncedHash.isEmpty()
    }

    enum class LinkStatus { SYNCED, DRIFTED, NOT_PULLED }

    private var state = State()

    // Transient caches — rebuilt from the server, never persisted.
    private val metadataCache = ConcurrentHashMap<String, Pair<Long, Set<String>>>()
    private val filesCache = ConcurrentHashMap<String, Pair<Long, List<dev.envpilot.jetbrains.model.SecretFileMeta>>>()
    private val metadataTtlMs = 30_000L

    @Volatile var revealUntilMs: Long = 0

    override fun getState(): State = state

    override fun loadState(s: State) {
        state = s
    }

    fun recordSync(
        path: String,
        keys: Set<String>,
        hash: String,
        secretFilePaths: List<String> = emptyList(),
        secretHashes: Map<String, String> = emptyMap(),
    ) {
        val entry =
            ManagedFileState().apply {
                this.keys = keys.toList()
                this.syncedHash = hash
                this.syncedAtMs = System.currentTimeMillis()
                this.secretFilePaths = secretFilePaths
                this.secretHashes = secretHashes
            }
        state.managed[path] = entry
    }

    fun managed(path: String): ManagedFile? {
        val entry = state.managed[path] ?: return null
        return ManagedFile(
            keys = entry.keys.toSet(),
            syncedHash = entry.syncedHash,
            syncedAtMs = entry.syncedAtMs,
            secretFilePaths = entry.secretFilePaths,
            secretHashes = entry.secretHashes,
        )
    }

    fun managedPaths(): Set<String> = state.managed.keys.toSet()

    fun markDrifted(path: String): Boolean {
        val entry = state.managed[path] ?: return false
        entry.syncedHash = ""
        return true
    }

    fun isDrifted(path: String): Boolean = state.managed[path]?.syncedHash?.isEmpty() == true

    /** Status of a linked directory's env file, for tree icons/labels. */
    fun statusFor(targetFile: String): LinkStatus {
        val entry = state.managed[targetFile] ?: return LinkStatus.NOT_PULLED
        if (entry.syncedHash.isEmpty()) return LinkStatus.DRIFTED
        if (!java.nio.file.Files.exists(java.nio.file.Path.of(targetFile))) return LinkStatus.NOT_PULLED
        return LinkStatus.SYNCED
    }

    /** Every secret file path Envpilot wrote, across all managed entries. */
    fun allTrackedSecretFiles(): List<String> = state.managed.values.flatMap { it.secretFilePaths }

    fun cachedFiles(key: String): List<dev.envpilot.jetbrains.model.SecretFileMeta>? {
        val (at, metas) = filesCache[key] ?: return null
        return if (System.currentTimeMillis() - at < metadataTtlMs) metas else null
    }

    fun cacheFiles(
        key: String,
        metas: List<dev.envpilot.jetbrains.model.SecretFileMeta>,
    ) {
        filesCache[key] = System.currentTimeMillis() to metas
    }

    fun cachedKeys(projectId: String): Set<String>? {
        val (at, keys) = metadataCache[projectId] ?: return null
        return if (System.currentTimeMillis() - at < metadataTtlMs) keys else null
    }

    fun cacheKeys(
        projectId: String,
        keys: Set<String>,
    ) {
        metadataCache[projectId] = System.currentTimeMillis() to keys
    }

    fun revealFor(seconds: Long = 30) {
        revealUntilMs = System.currentTimeMillis() + seconds * 1000
    }

    fun isRevealed(): Boolean = System.currentTimeMillis() < revealUntilMs

    companion object {
        fun getInstance(project: Project): EnvEditorService = project.getService(EnvEditorService::class.java)
    }
}
