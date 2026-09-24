package dev.envpilot.jetbrains.sync

import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.editor.EnvCloak
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.editor.pathKey
import dev.envpilot.jetbrains.guards.CommitGuard
import dev.envpilot.jetbrains.model.AccessMeta
import dev.envpilot.jetbrains.model.PullResult
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission

object PullService {
    private val log = logger<PullService>()

    private val PROTECTED_SEGMENTS = setOf(".git", ".husky", ".idea", ".vscode", ".envpilot")

    class PullAborted(message: String, cause: Throwable? = null) : Exception(message, cause)

    internal class SecretWrite(val bytes: ByteArray, val dest: Path, val mode: Int?)

    private val targetLocks = java.util.concurrent.ConcurrentHashMap<String, Mutex>()

    suspend fun pull(
        link: LinkedProject,
        project: Project? = null,
    ) {
        if (AuthService.getInstance().getSession() == null) throw PullAborted("Not signed in")
        val environment = link.environment.takeIf { it.isNotBlank() }

        val result = ConvexApi.pullValues(link.projectId, environment, metadataOnly = false)
        abortIfIncomplete(result)

        val fileMetas = if (link.includeSecretFiles) ConvexApi.listFiles(link.projectId, environment) else emptyList()
        val downloaded = fileMetas.map { ConvexApi.fileContent(it.id) }

        val dir = Path.of(link.directoryPath)
        val targetFile = dir.resolve(targetFileFor(link))
        val values = result.variables.associate { it.key to it.value }
        val mode = EnvFiles.ConflictMode.from(EnvpilotSettings.getInstance().state.conflictResolution)
        val editorState = project?.let { EnvEditorService.getInstance(it) }
        val blocked by lazy { listOfNotNull(targetFile.toAbsolutePath().normalize(), CommitGuard.configuredHooksDir(dir)) }
        val secrets =
            downloaded.map { (meta, bytes) ->
                val dest =
                    resolveWithin(dir, meta.path, blocked)
                        ?: throw PullAborted(
                            "Refusing secret file path ${meta.path}: it must stay inside the linked folder and cannot " +
                                "be an env file or target .git, .husky, .idea, .vscode, .envpilot or the git hooks directory.",
                        )
                SecretWrite(bytes, dest, meta.mode)
            }

        targetLocks.computeIfAbsent(targetFile.toAbsolutePath().normalize().toString()) { Mutex() }.withLock {
            val existing = EnvFiles.readIfExists(targetFile)
            val previousManaged = editorState?.managed(targetFile.toString())
            val merged = EnvFiles.resolve(existing, values, mode)
            val written = secrets.map { it.dest } + targetFile
            editorState?.writingPaths = written.map { pathKey(it.toString()) }.toSet()
            try {
                val secretHashes = writeFiles(targetFile, merged, existing, mode, secrets, previousManaged?.secretFilePaths)
                if (editorState != null) {
                    try {
                        editorState.cacheKeys(link.projectId, link.environment, values.keys)
                        editorState.cacheAccessMeta(
                            link.projectId,
                            AccessMeta(result.meta.environmentScope, result.meta.capabilities),
                        )
                        editorState.recordSync(
                            targetFile.toString(),
                            values.keys,
                            EnvCloak.hashOf(targetFile),
                            secretHashes.keys.toList(),
                            secretHashes,
                            envCreated = previousManaged?.envCreated ?: (existing == null),
                            autoUnsyncOnClose = result.meta.autoUnsyncOnClose,
                        )
                    } catch (e: Exception) {
                        log.warn("Editor state update failed: ${e.message}")
                    }
                }
                LocalFileSystem.getInstance().refreshNioFiles(written)
            } finally {
                editorState?.writingPaths = emptySet()
            }
        }
    }

    internal fun abortIfIncomplete(result: PullResult) {
        result.meta.truncatedAt?.let {
            throw PullAborted("Project has more than $it variables. Pull stopped to prevent an incomplete env file.")
        }
        val failed =
            result.meta.decryptionFailures.orEmpty() +
                result.variables.filter { it.value == "[DECRYPTION_FAILED]" }.map { it.key }
        if (failed.isNotEmpty()) {
            throw PullAborted("Decryption failed for ${failed.size} variable(s): ${failed.joinToString(", ")}")
        }
    }

    internal fun writeFiles(
        targetFile: Path,
        merged: String,
        existing: String?,
        conflictMode: EnvFiles.ConflictMode,
        secrets: List<SecretWrite>,
        previousManagedSecrets: List<String>?,
    ): Map<String, String> {
        val rollback =
            snapshot(
                buildSet {
                    add(targetFile)
                    add(EnvFiles.backupPath(targetFile))
                    for (secret in secrets) {
                        add(secret.dest)
                        add(secretBackupPath(secret.dest))
                    }
                },
            )
        val writtenSecrets = linkedMapOf<String, String>()
        try {
            if (conflictMode == EnvFiles.ConflictMode.BACKUP && existing != null && existing != merged) {
                EnvFiles.atomicWrite(EnvFiles.backupPath(targetFile), existing)
            }
            EnvFiles.atomicWrite(targetFile, merged)

            for (secret in secrets) {
                if (Files.exists(secret.dest)) {
                    guardExistingFile(secret.dest, secret.bytes, previousManagedSecrets)
                }
                EnvFiles.atomicWrite(secret.dest, secret.bytes, secret.mode?.takeIf { isPosix(secret.dest) }?.let(::posixPerms))
                writtenSecrets[secret.dest.toString()] = EnvCloak.hashOf(secret.dest)
            }
        } catch (e: Exception) {
            restore(rollback)
            throw PullAborted("Pull could not be written safely: ${e.message ?: e.javaClass.simpleName}", e)
        }
        return writtenSecrets
    }

    private fun guardExistingFile(
        dest: Path,
        incoming: ByteArray,
        previouslyOurs: List<String>?,
    ) {
        val oursNow = previouslyOurs?.contains(pathKey(dest.toString())) == true
        val current = Files.readAllBytes(dest)
        if (!oursNow && !current.contentEquals(incoming)) {
            val backup = secretBackupPath(dest)
            EnvFiles.atomicWrite(backup, current, null)
            log.warn("Overwriting non-Envpilot file $dest. Previous copy saved to $backup")
        }
    }

    internal fun resolveWithin(
        dir: Path,
        relativePath: String,
        blocked: List<Path> = emptyList(),
    ): Path? {
        val cleaned = relativePath.replace('\\', '/').trimStart('/')
        val segments = cleaned.lowercase().split('/')
        val base = segments.last()
        if (cleaned.isBlank() || base.endsWith(".env") || base.startsWith(".env.")) return null
        if (segments.any { it == ".." || it in PROTECTED_SEGMENTS }) return null
        val root = dir.toAbsolutePath().normalize()
        val resolved = root.resolve(cleaned).normalize()
        if (!resolved.startsWith(root) || blocked.any { resolved.startsWith(it) }) return null

        val realRoot = runCatching { root.toRealPath() }.getOrDefault(root)
        var probe = resolved
        while (!Files.exists(probe)) {
            probe = probe.parent ?: return null
        }
        val realProbe = runCatching { probe.toRealPath() }.getOrDefault(probe)
        return if (realProbe.startsWith(realRoot)) resolved else null
    }

    private fun isPosix(p: Path): Boolean = p.fileSystem.supportedFileAttributeViews().contains("posix")

    private data class FileSnapshot(
        val path: Path,
        val content: ByteArray?,
        val permissions: Set<PosixFilePermission>?,
    )

    private fun snapshot(paths: Set<Path>): List<FileSnapshot> =
        paths.map { path ->
            val exists = Files.exists(path)
            FileSnapshot(
                path,
                if (exists) Files.readAllBytes(path) else null,
                if (exists && isPosix(path)) Files.getPosixFilePermissions(path) else null,
            )
        }

    private fun restore(snapshots: List<FileSnapshot>) {
        for ((path, content, permissions) in snapshots.asReversed()) {
            runCatching {
                if (content == null) {
                    Files.deleteIfExists(path)
                } else {
                    EnvFiles.atomicWrite(path, content, permissions)
                }
            }.onFailure { log.error("Failed to roll back $path", it) }
        }
    }

    private fun secretBackupPath(path: Path): Path = path.resolveSibling(path.fileName.toString() + ".envpilot-bak")

    private fun posixPerms(mode: Int): Set<PosixFilePermission> {
        val perms = mutableSetOf<PosixFilePermission>()

        fun bit(
            mask: Int,
            perm: PosixFilePermission,
        ) {
            if (mode and mask != 0) perms.add(perm)
        }
        bit(0b100_000_000, PosixFilePermission.OWNER_READ)
        bit(0b010_000_000, PosixFilePermission.OWNER_WRITE)
        bit(0b001_000_000, PosixFilePermission.OWNER_EXECUTE)
        bit(0b000_100_000, PosixFilePermission.GROUP_READ)
        bit(0b000_010_000, PosixFilePermission.GROUP_WRITE)
        bit(0b000_001_000, PosixFilePermission.GROUP_EXECUTE)
        bit(0b000_000_100, PosixFilePermission.OTHERS_READ)
        bit(0b000_000_010, PosixFilePermission.OTHERS_WRITE)
        bit(0b000_000_001, PosixFilePermission.OTHERS_EXECUTE)
        return perms
    }
}
