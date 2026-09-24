package dev.envpilot.jetbrains.guards

import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import dev.envpilot.jetbrains.editor.EnvCloak
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.editor.pathKey
import dev.envpilot.jetbrains.sync.SyncState
import java.nio.file.Path

class FileDriftListener : BulkFileListener {
    override fun after(events: List<VFileEvent>) {
        val changed = events.filterIsInstance<VFileContentChangeEvent>()
        if (changed.isEmpty()) return
        for (project in ProjectManager.getInstance().openProjects) {
            val service = EnvEditorService.getInstance(project)
            val expected = service.expectedHashes()
            if (expected.isEmpty()) continue
            for (event in changed) {
                val path = pathKey(event.file.path)
                val syncedHash = expected[path] ?: continue
                if (path in service.writingPaths) continue
                val currentHash = runCatching { EnvCloak.hashOf(Path.of(path)) }.getOrNull() ?: continue
                if (currentHash == syncedHash) continue
                service.markDrifted(path)
                SyncState.markFailure(
                    project.locationHash,
                    "Drift detected: ${event.file.name} changed outside Envpilot. Next sync overwrites it.",
                )
                SyncState.notifyChanged()
            }
        }
    }
}
