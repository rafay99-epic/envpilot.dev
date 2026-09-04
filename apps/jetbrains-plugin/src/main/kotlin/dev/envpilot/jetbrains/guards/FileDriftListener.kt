package dev.envpilot.jetbrains.guards

import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import dev.envpilot.jetbrains.editor.EnvCloak
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.sync.SyncState
import java.nio.file.Path

/**
 * Detects external edits to managed env files and flags them as drifted so
 * the next sync overwrites them knowingly (status bar shows the drift).
 */
class FileDriftListener : BulkFileListener {
    override fun after(events: List<VFileEvent>) {
        val projects = ProjectManager.getInstance().openProjects
        if (projects.isEmpty()) return
        for (event in events) {
            if (event !is VFileContentChangeEvent) continue
            for (project in projects) {
                val service = EnvEditorService.getInstance(project)
                // A pull writing this very file is our own write, not drift.
                if (event.file.path in service.writingPaths) continue
                if (event.file.path in service.managedPaths()) {
                    val managed = service.managed(event.file.path) ?: continue
                    val currentHash =
                        runCatching {
                            EnvCloak.hashOf(Path.of(event.file.path))
                        }.getOrNull() ?: continue
                    if (currentHash != managed.syncedHash) {
                        service.markDrifted(event.file.path)
                        SyncState.markFailure(
                            project,
                            "Drift detected: ${event.file.name} changed outside Envpilot — next sync overwrites.",
                        )
                        SyncState.notifyChanged()
                    }
                }
                // Secret files are drift-watched against their synced hashes —
                // every managed entry, not just the first one.
                val secretHash =
                    service.managedPaths()
                        .mapNotNull { service.managed(it) }
                        .firstNotNullOfOrNull { it.secretHashes[event.file.path] }
                        ?: continue
                val currentHash =
                    runCatching {
                        EnvCloak.hashOf(Path.of(event.file.path))
                    }.getOrNull() ?: continue
                if (currentHash != secretHash) {
                    SyncState.markFailure(project, "Drift detected: ${event.file.name} changed outside Envpilot — next sync overwrites.")
                    SyncState.notifyChanged()
                }
            }
        }
    }
}
