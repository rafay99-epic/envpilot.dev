package dev.envpilot.jetbrains.sync

import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.api.EnvpilotApi
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
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

    suspend fun pull(link: LinkedProject, project: Project? = null): Int {
        val auth = AuthService.getInstance()
        if (auth.getSession() == null) throw PullAborted("Not signed in")
        val api = EnvpilotApi(EnvpilotSettings.getInstance().effectiveServerUrl()) { force ->
            auth.getFreshToken(force)
        }
        val environment = link.environment.takeIf { it.isNotBlank() }

        val result = api.pullValues(link.projectId, environment, metadataOnly = false)
        val failed = result.meta.decryptionFailures.orEmpty() +
            result.variables.filter { it.value == "[DECRYPTION_FAILED]" }.map { it.key }
        if (failed.isNotEmpty()) {
            throw PullAborted("Decryption failed for ${failed.size} variable(s): ${failed.joinToString(", ")}")
        }

        // Fetch everything first so a failure mid-pull writes nothing.
        val fileMetas = api.listFiles(link.projectId, environment)
        val downloaded = fileMetas.map { meta ->
            val (m, bytes) = api.fileContent(meta.id)
            m to bytes
        }

        val dir = Path.of(link.directoryPath)
        val targetFile = dir.resolve(
            EnvpilotSettings.getInstance().state.targetFile.ifBlank { ".env.local" }
        )
        val values = result.variables.associate { it.key to it.value }
        val merged = EnvFiles.merge(EnvFiles.readIfExists(targetFile), values)
        EnvFiles.atomicWrite(targetFile, merged)

        val writtenSecrets = mutableListOf<String>()
        for ((meta, bytes) in downloaded) {
            val dest = resolveWithin(dir, meta.path)
                ?: throw PullAborted("Refusing unsafe file path from server: ${meta.path}")
            Files.createDirectories(dest.parent)
            Files.write(dest, bytes)
            if (meta.mode != null && isPosix(dest)) {
                Files.setPosixFilePermissions(dest, posixPerms(meta.mode))
            }
            writtenSecrets.add(dest.toString())
        }
        if (project != null) {
            try {
                EnvEditorService.getInstance(project).recordSync(
                    targetFile.toString(), values.keys, values,
                    EnvCloak.hashOf(targetFile), writtenSecrets,
                )
            } catch (e: Exception) {
                log.warn("Editor state update failed: ${e.message}")
            }
        }
        return result.variables.size + downloaded.size
    }

    /** Resolve a server-provided relative path inside [dir], refusing escapes and symlinks out. */
    internal fun resolveWithin(dir: Path, relativePath: String): Path? {
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

    private fun isPosix(p: Path): Boolean =
        p.fileSystem.supportedFileAttributeViews().contains("posix")

    private fun posixPerms(mode: Int): Set<PosixFilePermission> {
        val perms = mutableSetOf<PosixFilePermission>()
        fun bit(mask: Int, perm: PosixFilePermission) {
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
