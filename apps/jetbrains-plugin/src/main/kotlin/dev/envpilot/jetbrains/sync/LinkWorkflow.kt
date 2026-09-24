package dev.envpilot.jetbrains.sync

import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.convex.ConvexSyncService
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.errors.Errors
import dev.envpilot.jetbrains.guards.CommitGuard

object LinkWorkflow {
    sealed interface Outcome {
        data object Disabled : Outcome

        data class Linked(val pullError: String?, val commitGuardMissing: Boolean) : Outcome

        data class Failed(val message: String) : Outcome
    }

    suspend fun linkAndSync(
        project: Project,
        projectId: String,
        orgId: String,
        deviceId: String,
        directory: String,
        pending: List<LinkedProject>,
    ): Outcome {
        val links = LinkedProjectsService.getInstance(project)
        val other = links.all().firstOrNull { it.directoryPath == directory && it.projectId != projectId }
        if (other != null) return Outcome.Failed("This folder is already linked to ${other.projectName}. One folder, one Envpilot project.")
        return try {
            if (!SyncScheduler.getInstance().refreshAccess(orgId)) return Outcome.Disabled
            ConvexApi.linkDevice(projectId, deviceId, JetBrainsDevice.name())
            pending.forEach(links::add)
            ConvexSyncService.getInstance().watchProject(projectId)
            val ok = SyncScheduler.getInstance().runCycle(project)
            val settings = EnvpilotSettings.getInstance().state
            val guardMissing =
                settings.commitGuardAutoInstall &&
                    !runCatching {
                        CommitGuard.install(directory, EnvEditorService.getInstance(project).expectedHashes().keys)
                    }.getOrDefault(false)
            if (settings.commitGuardAutoInstall && !guardMissing) settings.commitGuardEnabled = true
            Outcome.Linked(
                pullError = if (ok) null else SyncState.lastError(project.locationHash) ?: "unknown error",
                commitGuardMissing = guardMissing,
            )
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: Exception) {
            Errors.report(error, mapOf("surface" to "link"))
            Outcome.Failed(Errors.friendly(error))
        }
    }
}
