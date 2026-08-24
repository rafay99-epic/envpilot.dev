package dev.envpilot.jetbrains.sync

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.util.messages.Topic
import dev.envpilot.jetbrains.config.EnvpilotSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

interface SyncStateListener {
    fun syncStateChanged()
}

/** App-wide observable sync status consumed by the status bar widget. */
object SyncState {
    @Volatile var syncing: Boolean = false
        private set
    @Volatile var lastError: String? = null
        private set
    @Volatile var lastSyncAtMs: Long = 0
        private set

    fun markStart() { syncing = true }
    fun markSuccess() {
        syncing = false
        lastError = null
        lastSyncAtMs = System.currentTimeMillis()
    }
    fun markFailure(message: String) {
        syncing = false
        lastError = message
    }

    fun notifyChanged() {
        ApplicationManager.getApplication().messageBus
            .syncPublisher(SYNC_TOPIC).syncStateChanged()
    }

    val SYNC_TOPIC: Topic<SyncStateListener> =
        Topic.create("EnvpilotSyncStateChanged", SyncStateListener::class.java)
}

@Service(Service.Level.APP)
class SyncScheduler {

    private val log = logger<SyncScheduler>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val jobs = ConcurrentHashMap<String, Job>()

    /** Start (or restart) the auto-sync loop for one open IDE project. */
    fun startFor(project: Project) {
        stopFor(project)
        jobs[project.locationHash] = scope.launch {
            val settings = EnvpilotSettings.getInstance().state
            if (!settings.autoSync) return@launch
            delay(5_000)
            while (isActive) {
                runCycle(project)
                val intervalSec = settings.syncIntervalSeconds.coerceIn(60, 3600).toLong()
                delay(intervalSec * 1000)
            }
        }
    }

    fun stopFor(project: Project) {
        jobs.remove(project.locationHash)?.cancel()
    }

    suspend fun runCycle(project: Project): Boolean {
        val links = LinkedProjectsService.getInstance(project).all()
        if (links.isEmpty()) return false
        SyncState.markStart()
        SyncState.notifyChanged()
        var allOk = true
        for (link in links) {
            try {
                PullService.pull(link)
            } catch (e: Exception) {
                log.warn("Pull failed for ${link.projectName}/${link.environment}: ${e.message}")
                SyncState.markFailure("${link.projectName}: ${e.message}")
                allOk = false
                break
            }
        }
        if (allOk) SyncState.markSuccess()
        SyncState.notifyChanged()
        return allOk
    }

    companion object {
        fun getInstance(): SyncScheduler =
            ApplicationManager.getApplication().getService(SyncScheduler::class.java)
    }
}

