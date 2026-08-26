package dev.envpilot.jetbrains.sync

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.config.EnvpilotSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

@Service(Service.Level.APP)
class SyncScheduler {
    private val log = logger<SyncScheduler>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val jobs = ConcurrentHashMap<String, Job>()

    /** Start (or restart) the auto-sync loop for one open IDE project. */
    fun startFor(project: Project) {
        stopFor(project)
        jobs[project.locationHash] =
            scope.launch {
                val settings = EnvpilotSettings.getInstance().state
                if (!settings.autoSync) return@launch
                delay(5_000)
                while (isActive) {
                    if (isIdlePaused()) {
                        // Idle past the threshold — re-check in a minute.
                        delay(60_000)
                        continue
                    }
                    runCycle(project)
                    val intervalSec = settings.syncIntervalSeconds.coerceIn(60, 3600).toLong()
                    delay(intervalSec * 1000)
                }
            }
    }

    fun stopFor(project: Project) {
        jobs.remove(project.locationHash)?.cancel()
    }

    private fun isIdlePaused(): Boolean {
        val minutes = EnvpilotSettings.getInstance().state.idlePauseMinutes
        if (minutes <= 0) return false
        val idleMs = com.intellij.ide.IdeEventQueue.getInstance().idleTime
        return idleMs >= minutes * 60_000L
    }

    suspend fun runCycle(project: Project): Boolean {
        val links = LinkedProjectsService.getInstance(project).all()
        if (links.isEmpty()) return false
        SyncState.markStart()
        SyncState.notifyChanged()
        var allOk = true
        for (link in links) {
            try {
                if (link.deviceId.isBlank()) {
                    val deviceId = JetBrainsDevice.id()
                    dev.envpilot.jetbrains.convex.ConvexApi.linkDevice(
                        link.projectId,
                        deviceId,
                        JetBrainsDevice.name(),
                    )
                    link.deviceId = deviceId
                }
                PullService.pull(link, project)
            } catch (e: Exception) {
                log.warn("Pull failed for ${link.projectName}/${link.environment}: ${e.message}")
                dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "sync", "project" to link.projectName))
                SyncState.markFailure("${link.projectName}: ${dev.envpilot.jetbrains.errors.Errors.friendly(e)}")
                allOk = false
                break
            }
        }
        if (allOk) SyncState.markSuccess()
        SyncState.notifyChanged()
        return allOk
    }

    companion object {
        fun getInstance(): SyncScheduler = ApplicationManager.getApplication().getService(SyncScheduler::class.java)
    }
}
