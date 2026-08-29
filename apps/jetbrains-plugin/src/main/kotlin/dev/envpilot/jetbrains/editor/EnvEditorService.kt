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
        var envCreated: Boolean = false
        var autoUnsyncOnClose: Boolean = true
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
        val envCreated: Boolean,
        val autoUnsyncOnClose: Boolean,
    ) {
        fun isDrifted(): Boolean = syncedHash.isEmpty()
    }

    enum class LinkStatus { SYNCED, DRIFTED, NOT_PULLED }

    private var state = State()

    // Transient caches — rebuilt from the server, never persisted.
    private val metadataCache = ConcurrentHashMap<String, Pair<Long, Set<String>>>()
    private val filesCache = ConcurrentHashMap<String, Pair<Long, List<dev.envpilot.jetbrains.model.SecretFileMeta>>>()
    private val capabilityCache = ConcurrentHashMap<String, Map<String, Boolean>>()
    private val environmentScopeCache = ConcurrentHashMap<String, List<String>>()
    private val accessMetaProjects = ConcurrentHashMap.newKeySet<String>()
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
        envCreated: Boolean = false,
        autoUnsyncOnClose: Boolean = true,
    ) {
        val entry =
            ManagedFileState().apply {
                this.keys = keys.toList()
                this.syncedHash = hash
                this.syncedAtMs = System.currentTimeMillis()
                this.secretFilePaths = secretFilePaths
                this.secretHashes = secretHashes
                this.envCreated = envCreated
                this.autoUnsyncOnClose = autoUnsyncOnClose
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
            envCreated = entry.envCreated,
            autoUnsyncOnClose = entry.autoUnsyncOnClose,
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

    fun cacheCapabilities(
        projectId: String,
        capabilities: Map<String, Boolean>,
    ) {
        capabilityCache[projectId] = capabilities
    }

    fun cacheAccessMeta(
        projectId: String,
        meta: dev.envpilot.jetbrains.model.PullMeta,
    ) {
        accessMetaProjects.add(projectId)
        cacheCapabilities(projectId, meta.capabilities)
        if (meta.environmentScope == null) {
            environmentScopeCache.remove(projectId)
        } else {
            environmentScopeCache[projectId] = meta.environmentScope
        }
    }

    fun hasCapability(
        projectId: String,
        capability: String,
    ): Boolean = capabilityCache[projectId]?.get(capability) == true

    fun hasAccessMeta(projectId: String): Boolean = projectId in accessMetaProjects

    fun allowedEnvironments(projectId: String): List<String> =
        environmentScopeCache[projectId] ?: dev.envpilot.jetbrains.model.VALID_ENVIRONMENTS

    fun canReveal(projectIds: Collection<String>): Boolean =
        projectIds.isNotEmpty() &&
            projectIds.all {
                capabilityCache[it]?.get("project.secrets.reveal") == true
            }

    data class PurgeResult(val removed: Int, val preserved: Int)

    fun purgeManagedFiles(respectAutoUnsync: Boolean = false): PurgeResult {
        var removed = 0
        var preserved = 0
        for ((envPath, entry) in state.managed.toMap()) {
            if (respectAutoUnsync && !entry.autoUnsyncOnClose) continue
            var keepState = false
            val env = java.nio.file.Path.of(envPath)
            if (java.nio.file.Files.exists(env)) {
                val unchanged = runCatching { EnvCloak.hashOf(env) == entry.syncedHash }.getOrDefault(false)
                if (entry.envCreated && unchanged) {
                    makeWritable(env)
                    if (java.nio.file.Files.deleteIfExists(env)) removed++
                } else {
                    preserved++
                    keepState = true
                }
            }
            for (secretPath in entry.secretFilePaths) {
                val secret = java.nio.file.Path.of(secretPath)
                if (!java.nio.file.Files.exists(secret)) continue
                val unchanged =
                    runCatching { EnvCloak.hashOf(secret) == entry.secretHashes[secretPath] }
                        .getOrDefault(false)
                if (unchanged) {
                    makeWritable(secret)
                    if (java.nio.file.Files.deleteIfExists(secret)) removed++
                } else {
                    preserved++
                    keepState = true
                }
            }
            if (!keepState) state.managed.remove(envPath)
        }
        metadataCache.clear()
        filesCache.clear()
        capabilityCache.clear()
        environmentScopeCache.clear()
        accessMetaProjects.clear()
        revealUntilMs = 0
        return PurgeResult(removed, preserved)
    }

    private fun makeWritable(path: java.nio.file.Path) {
        path.toFile().setWritable(true, true)
    }

    fun revealFor(seconds: Long = 30) {
        revealUntilMs = System.currentTimeMillis() + seconds * 1000
    }

    fun isRevealed(): Boolean = System.currentTimeMillis() < revealUntilMs

    companion object {
        fun getInstance(project: Project): EnvEditorService = project.getService(EnvEditorService::class.java)
    }
}
