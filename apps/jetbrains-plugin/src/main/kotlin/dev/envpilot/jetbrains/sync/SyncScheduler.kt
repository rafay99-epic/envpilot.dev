package dev.envpilot.jetbrains.sync

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.auth.AuthStateListener
import dev.envpilot.jetbrains.config.EnvpilotSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

/**
 * The injected scope is tied to the service lifetime, so it (and everything
 * parented to this Disposable) dies with the plugin.
 */
@Service(Service.Level.APP)
class SyncScheduler(private val scope: CoroutineScope) : Disposable {
    private val log = logger<SyncScheduler>()
    private val jobs = ConcurrentHashMap<String, Job>()

    // Timer, realtime pushes, IDE activation and manual pulls can all fire at
    // once — single-flight keeps file writes from interleaving. Per project, so
    // one project stalled on the network cannot block Pull Now in another.
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

    /** Start (or restart) the auto-sync loop for one open IDE project. */
    fun startFor(project: Project) {
        stopFor(project)
        jobs[project.locationHash] =
            scope.launch(Dispatchers.IO) {
                delay(5_000)
                while (isActive) {
                    // Read fresh every cycle: settings changes must apply
                    // without reopening the project (the State object is
                    // replaced on reload, so a captured reference goes stale).
                    val settings = EnvpilotSettings.getInstance().state
                    if (settings.autoSync && !isIdlePaused()) {
                        runCycle(project)
                    }
                    val intervalSec = EnvpilotSettings.getInstance().state.syncIntervalSeconds.coerceIn(60, 3600).toLong()
                    delay(intervalSec * 1000)
                }
            }
    }

    /** Plugin-lifetime launcher for callers with no scope of their own (actions, gutter, startup). */
    fun launch(block: suspend () -> Unit): Job = scope.launch(Dispatchers.IO) { block() }

    fun stopFor(project: Project) {
        jobs.remove(project.locationHash)?.cancel()
    }

    /** Is the JetBrains plugin enabled for this org? Served from the last sync cycle; queried once when cold. */
    suspend fun hasAccess(orgId: String): Boolean =
        accessByOrg[orgId]
            ?: dev.envpilot.jetbrains.convex.ConvexApi.jetbrainsAccess(orgId).also { accessByOrg[orgId] = it }

    private fun isIdlePaused(): Boolean {
        val minutes = EnvpilotSettings.getInstance().state.idlePauseMinutes
        if (minutes <= 0) return false
        val idleMs = com.intellij.ide.IdeEventQueue.getInstance().idleTime
        return idleMs >= minutes * 60_000L
    }

    suspend fun runCycle(project: Project): Boolean =
        cycleMutexes.computeIfAbsent(project.locationHash) { Mutex() }.withLock {
            val links = LinkedProjectsService.getInstance(project).all()
            if (links.isEmpty()) return@withLock false
            SyncState.markStart(project)
            SyncState.notifyChanged()
            val failures = mutableListOf<String>()
            // Ask the server once per org per cycle so an owner flipping the gate
            // takes effect on the next sync; the cache only serves actions between cycles.
            val gates = mutableMapOf<String, Boolean>()
            for (link in links) {
                try {
                    val allowed =
                        gates.getOrPut(link.orgId) {
                            dev.envpilot.jetbrains.convex.ConvexApi.jetbrainsAccess(link.orgId).also { accessByOrg[link.orgId] = it }
                        }
                    if (!allowed) {
                        failures.add(dev.envpilot.jetbrains.errors.Errors.PLUGIN_DISABLED)
                        continue
                    }
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
                    failures.add("${link.projectName}: ${dev.envpilot.jetbrains.errors.Errors.friendly(e)}")
                    // One broken project must not block syncing the rest.
                }
            }
            // Aggregate: last-write-wins would hide every failure but the last.
            if (failures.isEmpty()) {
                SyncState.markSuccess(project)
            } else {
                SyncState.markFailure(project, failures.distinct().joinToString(" · "))
            }
            SyncState.notifyChanged()
            failures.isEmpty()
        }

    override fun dispose() = Unit

    companion object {
        fun getInstance(): SyncScheduler = ApplicationManager.getApplication().getService(SyncScheduler::class.java)
    }
}
