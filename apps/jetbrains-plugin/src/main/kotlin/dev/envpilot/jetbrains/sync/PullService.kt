package dev.envpilot.jetbrains.sync

import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.editor.EnvCloak
import dev.envpilot.jetbrains.editor.EnvEditorService
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

    class PullAborted(message: String) : Exception(message)

    suspend fun pull(
        link: LinkedProject,
        project: Project? = null,
    ): Int {
        if (AuthService.getInstance().getSession() == null) throw PullAborted("Not signed in")
        val environment = link.environment.takeIf { it.isNotBlank() }

        val result = ConvexApi.pullValues(link.projectId, environment, metadataOnly = false)
        val failed =
            result.meta.decryptionFailures.orEmpty() +
                result.variables.filter { it.value == "[DECRYPTION_FAILED]" }.map { it.key }
        if (failed.isNotEmpty()) {
            throw PullAborted("Decryption failed for ${failed.size} variable(s): ${failed.joinToString(", ")}")
        }

        // Fetch everything first so a failure mid-pull writes nothing.
        val fileMetas = ConvexApi.listFiles(link.projectId, environment)
        val downloaded =
            fileMetas.map { meta ->
                val (m, bytes) = ConvexApi.fileContent(meta.id)
                m to bytes
            }

        val dir = Path.of(link.directoryPath)
        val targetFile =
            dir.resolve(
                EnvpilotSettings.getInstance().state.targetFile.ifBlank { ".env.local" },
            )
        val values = result.variables.associate { it.key to it.value }
        val mode = EnvFiles.ConflictMode.from(EnvpilotSettings.getInstance().state.conflictResolution)
        val existing = EnvFiles.readIfExists(targetFile)
        val previousManaged = project?.let { EnvEditorService.getInstance(it).managed(targetFile.toString()) }
        val merged = EnvFiles.resolve(existing, values, mode)
        val resolvedFiles =
            downloaded.map { (meta, bytes) ->
                val dest =
                    resolveWithin(dir, meta.path)
                        ?: throw PullAborted("Refusing unsafe file path from server: ${meta.path}")
                Triple(meta, bytes, dest)
            }
        val rollback =
            snapshot(
                buildSet {
                    add(targetFile)
                    add(EnvFiles.backupPath(targetFile))
                    for ((_, _, dest) in resolvedFiles) {
                        add(dest)
                        add(secretBackupPath(dest))
                    }
                },
            )
        val writtenSecrets = mutableListOf<String>()
        val secretHashes = mutableMapOf<String, String>()
        try {
            if (mode == EnvFiles.ConflictMode.BACKUP && existing != null && existing != merged) {
                EnvFiles.atomicWrite(EnvFiles.backupPath(targetFile), existing)
            }
            EnvFiles.atomicWrite(targetFile, merged)

            for ((meta, bytes, dest) in resolvedFiles) {
                Files.createDirectories(dest.parent)
                if (Files.exists(dest)) {
                    guardExistingFile(dest, bytes, previousManaged?.secretFilePaths)
                }
                Files.write(dest, bytes)
                if (meta.mode != null && isPosix(dest)) {
                    Files.setPosixFilePermissions(dest, posixPerms(meta.mode))
                }
                writtenSecrets.add(dest.toString())
                secretHashes[dest.toString()] = EnvCloak.hashOf(dest)
            }
        } catch (e: Exception) {
            restore(rollback)
            throw PullAborted("Pull could not be written safely: ${e.message ?: e.javaClass.simpleName}")
        }
        if (project != null) {
            try {
                val editorState = EnvEditorService.getInstance(project)
                editorState.cacheKeys(link.projectId, values.keys)
                editorState.cacheCapabilities(link.projectId, result.meta.capabilities)
                editorState.recordSync(
                    targetFile.toString(),
                    values.keys,
                    EnvCloak.hashOf(targetFile),
                    writtenSecrets,
                    secretHashes,
                    envCreated = previousManaged?.envCreated ?: (existing == null),
                )
            } catch (e: Exception) {
                log.warn("Editor state update failed: ${e.message}")
            }
        }
        return result.variables.size + downloaded.size
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
