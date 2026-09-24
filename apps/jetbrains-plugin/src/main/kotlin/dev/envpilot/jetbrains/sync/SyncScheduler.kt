package dev.envpilot.jetbrains.sync

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.auth.AuthStateListener
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.errors.Errors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import java.util.concurrent.ConcurrentHashMap

@Service(Service.Level.APP)
class SyncScheduler(private val scope: CoroutineScope) : Disposable {
    private val log = logger<SyncScheduler>()
    private val jobs = ConcurrentHashMap<String, Job>()

    private val cycleMutexes = ConcurrentHashMap<String, Mutex>()

    private val accessByOrg = ConcurrentHashMap<String, Boolean>()

    init {
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            AuthService.AUTH_TOPIC,
            object : AuthStateListener {
                override fun authChanged() {
                    accessByOrg.clear()
                }
            },
        )
    }

    fun startFor(project: Project) {
        stopFor(project)
        jobs[project.locationHash] =
            scope.launch(Dispatchers.IO) {
                delay(5_000)
                while (isActive) {
                    if (EnvpilotSettings.getInstance().state.autoSync && !isIdlePaused()) {
                        runCycle(project, skipIfBusy = true)
                    }
                    val intervalSec = EnvpilotSettings.getInstance().state.syncIntervalSeconds.coerceIn(60, 3600).toLong()
                    delay(intervalSec * 1000)
                }
            }
    }

    fun launch(block: suspend () -> Unit): Job = scope.launch(Dispatchers.IO) { block() }

    fun stopFor(project: Project) {
        jobs.remove(project.locationHash)?.cancel()
    }

    private fun accessKey(orgId: String) = "${AuthService.getInstance().userId}:$orgId"

    suspend fun hasAccess(orgId: String): Boolean = accessByOrg[accessKey(orgId)] ?: refreshAccess(orgId)

    fun cachedAccess(orgId: String): Boolean? = accessByOrg[accessKey(orgId)]

    suspend fun refreshAccess(orgId: String): Boolean {
        val key = accessKey(orgId)
        return ConvexApi.jetbrainsAccess(orgId).also { accessByOrg[key] = it }
    }

    private fun isIdlePaused(): Boolean {
        val minutes = EnvpilotSettings.getInstance().state.idlePauseMinutes
        if (minutes <= 0) return false
        val idleMs = com.intellij.ide.IdeEventQueue.getInstance().idleTime
        return idleMs >= minutes * 60_000L
    }

    suspend fun runCycle(
        project: Project,
        skipIfBusy: Boolean = false,
    ): Boolean {
        val mutex = cycleMutexes.computeIfAbsent(project.locationHash) { Mutex() }
        if (!skipIfBusy) {
            mutex.lock()
        } else if (!mutex.tryLock()) {
            return false
        }
        try {
            val links = LinkedProjectsService.getInstance(project).all()
            if (links.isEmpty()) return false
            SyncState.markStart(project.locationHash)
            SyncState.notifyChanged()
            val failures = mutableListOf<String>()
            val gates = mutableMapOf<String, Boolean>()
            for (link in links) {
                try {
                    val allowed = gates.getOrPut(link.orgId) { refreshAccess(link.orgId) }
                    if (!allowed) {
                        failures.add(Errors.PLUGIN_DISABLED)
                        continue
                    }
                    val linked =
                        if (link.deviceId.isBlank()) {
                            val deviceId = JetBrainsDevice.id()
                            ConvexApi.linkDevice(link.projectId, deviceId, JetBrainsDevice.name())
                            LinkedProjectsService.getInstance(project).recordDevice(link, deviceId)
                        } else {
                            link
                        }
                    PullService.pull(linked, project)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    log.warn("Pull failed for ${link.projectName}/${link.environment}: ${e.message}")
                    Errors.report(e, mapOf("surface" to "sync", "project" to link.projectName))
                    failures.add("${link.projectName}: ${Errors.friendly(e)}")
                }
            }
            if (failures.isEmpty()) {
                SyncState.markSuccess(project.locationHash)
            } else {
                SyncState.markFailure(project.locationHash, failures.distinct().joinToString(" · "))
            }
            SyncState.notifyChanged()
            return failures.isEmpty()
        } finally {
            mutex.unlock()
        }
    }

    override fun dispose() = Unit

    companion object {
        fun getInstance(): SyncScheduler = ApplicationManager.getApplication().getService(SyncScheduler::class.java)
    }
}
