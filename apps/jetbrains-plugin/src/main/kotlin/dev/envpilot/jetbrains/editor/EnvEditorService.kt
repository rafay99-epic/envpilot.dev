package dev.envpilot.jetbrains.editor

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.StoragePathMacros
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import java.util.concurrent.ConcurrentHashMap

internal fun pathKey(path: String): String {
    val normalized = FileUtil.toSystemIndependentName(path)
    val file = java.io.File(normalized)
    if (!file.isAbsolute) return normalized
    return FileUtil.toSystemIndependentName(runCatching { file.canonicalPath }.getOrDefault(normalized))
}

@Service(Service.Level.PROJECT)
@State(
    name = "EnvpilotEditorState",
    storages = [Storage(StoragePathMacros.WORKSPACE_FILE), Storage(value = "EnvpilotPlugin.xml", deprecated = true)],
)
class EnvEditorService : PersistentStateComponent<EnvEditorService.State> {
    data class ManagedFileState(
        var keys: List<String> = emptyList(),
        var syncedHash: String = "",
        var syncedAtMs: Long = 0,
        var secretFilePaths: List<String> = emptyList(),
        var secretHashes: Map<String, String> = emptyMap(),
        var envCreated: Boolean = false,
        var autoUnsyncOnClose: Boolean = true,
    )

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
    )

    enum class LinkStatus { SYNCED, DRIFTED, NOT_PULLED }

    private var state = State()

    private val metadataCache = ConcurrentHashMap<String, Pair<Long, Set<String>>>()
    private val filesCache = ConcurrentHashMap<String, Pair<Long, List<dev.envpilot.jetbrains.model.SecretFileMeta>>>()
    private val accessMeta = ConcurrentHashMap<String, dev.envpilot.jetbrains.model.AccessMeta>()
    private val metadataTtlMs = 30_000L

    @Volatile var revealUntilMs: Long = 0

    @Volatile var writingPaths: Set<String> = emptySet()

    @Synchronized
    override fun getState(): State = state

    @Synchronized
    override fun loadState(s: State) {
        state = s
    }

    @Synchronized
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
            ManagedFileState(
                keys = keys.toList(),
                syncedHash = hash,
                syncedAtMs = System.currentTimeMillis(),
                secretFilePaths = secretFilePaths.map(::pathKey),
                secretHashes = secretHashes.mapKeys { pathKey(it.key) },
                envCreated = envCreated,
                autoUnsyncOnClose = autoUnsyncOnClose,
            )
        write(state.managed + (pathKey(path) to entry))
    }

    @Synchronized
    fun managed(path: String): ManagedFile? {
        val entry = state.managed[pathKey(path)] ?: return null
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

    @Synchronized
    fun managedPaths(): Set<String> = state.managed.keys.toSet()

    @Synchronized
    fun expectedHashes(): Map<String, String> =
        buildMap {
            state.managed.forEach { (path, entry) ->
                putAll(entry.secretHashes)
                put(path, entry.syncedHash)
            }
        }

    @Synchronized
    fun markDrifted(path: String): Boolean {
        val key = pathKey(path)
        val entry = state.managed[key] ?: return false
        write(state.managed + (key to entry.copy(syncedHash = "")))
        return true
    }

    @Synchronized
    fun statusFor(targetFile: String): LinkStatus {
        val entry = state.managed[pathKey(targetFile)] ?: return LinkStatus.NOT_PULLED
        if (entry.syncedHash.isEmpty()) return LinkStatus.DRIFTED
        if (!java.nio.file.Files.exists(java.nio.file.Path.of(targetFile))) return LinkStatus.NOT_PULLED
        return LinkStatus.SYNCED
    }

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

    fun cachedKeys(
        projectId: String,
        environment: String,
    ): Set<String>? {
        val (at, keys) = metadataCache["$projectId:$environment"] ?: return null
        return if (System.currentTimeMillis() - at < metadataTtlMs) keys else null
    }

    fun cacheKeys(
        projectId: String,
        environment: String,
        keys: Set<String>,
    ) {
        metadataCache["$projectId:$environment"] = System.currentTimeMillis() to keys
    }

    fun cacheAccessMeta(
        projectId: String,
        meta: dev.envpilot.jetbrains.model.AccessMeta,
    ) {
        accessMeta[projectId] = meta
    }

    fun hasCapability(
        projectId: String,
        capability: String,
    ): Boolean = accessMeta[projectId]?.capabilities?.get(capability) == true

    fun hasAccessMeta(projectId: String): Boolean = accessMeta.containsKey(projectId)

    fun allowedEnvironments(projectId: String): List<String> =
        accessMeta[projectId]?.environmentScope ?: dev.envpilot.jetbrains.model.VALID_ENVIRONMENTS

    fun canReveal(projectIds: Collection<String>): Boolean =
        projectIds.isNotEmpty() && projectIds.all { hasCapability(it, "project.secrets.reveal") }

    data class PurgeResult(val removed: Int, val preserved: Int)

    @Synchronized
    fun purgeManagedFiles(respectAutoUnsync: Boolean = false): PurgeResult {
        var removed = 0
        var preserved = 0
        val kept = state.managed.toMutableMap()
        for ((envPath, entry) in state.managed) {
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
            if (!keepState) kept.remove(envPath)
        }
        write(kept)
        metadataCache.clear()
        filesCache.clear()
        accessMeta.clear()
        revealUntilMs = 0
        return PurgeResult(removed, preserved)
    }

    private fun write(managed: Map<String, ManagedFileState>) {
        state = State().also { it.managed = managed.toMutableMap() }
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
