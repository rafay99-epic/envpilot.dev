package dev.envpilot.jetbrains.sync

import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.editor.EnvCloak
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.model.PullResult
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission

/**
 * Pulls one linked project into its directory: decrypted variable values are
 * merged into the target .env file, then secret files are materialized.
 *
 * Everything is fetched before anything is written, and decrypt failures abort
 * the whole pull loudly — we never write partially resolved state.
 */
object PullService {
    private val log = logger<PullService>()

    class PullAborted(message: String, cause: Throwable? = null) : Exception(message, cause)

    internal class SecretWrite(val bytes: ByteArray, val dest: Path, val mode: Int?)

    private val targetLocks = java.util.concurrent.ConcurrentHashMap<String, Mutex>()

    suspend fun pull(
        link: LinkedProject,
        project: Project? = null,
    ): Int {
        if (AuthService.getInstance().getSession() == null) throw PullAborted("Not signed in")
        val environment = link.environment.takeIf { it.isNotBlank() }

        val result = ConvexApi.pullValues(link.projectId, environment, metadataOnly = false)
        abortIfIncomplete(result)

        // Fetch everything first so a failure mid-pull writes nothing.
        val fileMetas = if (link.includeSecretFiles) ConvexApi.listFiles(link.projectId, environment) else emptyList()
        val downloaded =
            fileMetas.map { meta ->
                val (m, bytes) = ConvexApi.fileContent(meta.id)
                m to bytes
            }

        val dir = Path.of(link.directoryPath)
        val targetFile = dir.resolve(targetFileFor(link))
        val values = result.variables.associate { it.key to it.value }
        val mode = EnvFiles.ConflictMode.from(EnvpilotSettings.getInstance().state.conflictResolution)
        val editorState = project?.let { EnvEditorService.getInstance(it) }
        val secrets =
            downloaded.map { (meta, bytes) ->
                val dest =
                    resolveWithin(dir, meta.path)
                        ?: throw PullAborted("Refusing unsafe file path from server: ${meta.path}")
                SecretWrite(bytes, dest, meta.mode)
            }

        // One writer per target file: two IDE projects linked to the same folder
        // must not merge over each other's half-written file.
        targetLocks.computeIfAbsent(targetFile.toAbsolutePath().normalize().toString()) { Mutex() }.withLock {
            val existing = EnvFiles.readIfExists(targetFile)
            val previousManaged = editorState?.managed(targetFile.toString())
            val merged = EnvFiles.resolve(existing, values, mode)
            // Suppress our own VFS drift events for exactly the files we write.
            editorState?.writingPaths = (secrets.map { it.dest } + targetFile).map { it.toString() }.toSet()
            try {
                val secretHashes = writeFiles(targetFile, merged, existing, mode, secrets, previousManaged?.secretFilePaths)
                if (editorState != null) {
                    try {
                        editorState.cacheKeys(link.projectId, values.keys)
                        editorState.cacheAccessMeta(link.projectId, result.meta)
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
            } finally {
                editorState?.writingPaths = emptySet()
            }
        }
        return result.variables.size + downloaded.size
    }

    /** A truncated or partially decrypted result must never reach the disk. */
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

    /**
     * Write the env file and every secret file, rolling every touched path back
     * to its prior bytes and permissions if any single write fails.
     * Returns the secret paths written with their hashes; hashing inside the
     * rollback window means an unreadable file fails the pull instead of
     * staying on disk unmanaged.
     */
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
                Files.createDirectories(secret.dest.parent)
                if (Files.exists(secret.dest)) {
                    guardExistingFile(secret.dest, secret.bytes, previousManagedSecrets)
                }
                Files.write(secret.dest, secret.bytes)
                if (secret.mode != null && isPosix(secret.dest)) {
                    Files.setPosixFilePermissions(secret.dest, posixPerms(secret.mode))
                }
                writtenSecrets[secret.dest.toString()] = EnvCloak.hashOf(secret.dest)
            }
        } catch (e: Exception) {
            restore(rollback)
            throw PullAborted("Pull could not be written safely: ${e.message ?: e.javaClass.simpleName}", e)
        }
        return writtenSecrets
    }

    /**
     * A previous pull may have left the file read-only (vault mode bits) —
     * make it writable before rewriting. If the existing file is NOT one we
     * wrote and differs from the vault copy, back it up first: overwriting a
     * foreign file silently is a data-loss bug.
     */
    private fun guardExistingFile(
        dest: Path,
        incoming: ByteArray,
        previouslyOurs: List<String>?,
    ) {
        if (isPosix(dest)) {
            val perms = Files.getPosixFilePermissions(dest).toMutableSet()
            if (perms.add(PosixFilePermission.OWNER_WRITE)) {
                Files.setPosixFilePermissions(dest, perms)
            }
        }
        val oursNow = previouslyOurs?.contains(dest.toString()) == true
        val current = Files.readAllBytes(dest)
        if (!oursNow && !current.contentEquals(incoming)) {
            val backup = secretBackupPath(dest)
            Files.write(backup, current)
            log.warn("Overwriting non-Envpilot file $dest — previous copy saved to $backup")
        }
    }

    /** Resolve a server-provided relative path inside [dir], refusing escapes and symlinks out. */
    internal fun resolveWithin(
        dir: Path,
        relativePath: String,
    ): Path? {
        val cleaned = relativePath.replace('\\', '/').trimStart('/')
        if (cleaned.isBlank() || cleaned.split('/').any { it == ".." }) return null
        val root = dir.toAbsolutePath().normalize()
        val resolved = root.resolve(cleaned).normalize()
        if (!resolved.startsWith(root)) return null

        // Symlink check: nearest existing ancestor must really live under the real root.
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
                    path.parent?.let(Files::createDirectories)
                    Files.write(path, content)
                    if (permissions != null && isPosix(path)) Files.setPosixFilePermissions(path, permissions)
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
