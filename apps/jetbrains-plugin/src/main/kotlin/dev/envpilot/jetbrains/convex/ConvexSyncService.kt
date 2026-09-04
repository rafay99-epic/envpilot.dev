package dev.envpilot.jetbrains.convex

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.sync.SyncScheduler
import dev.envpilot.jetbrains.sync.SyncState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicReference

/**
 * Real-time sync: one Convex WebSocket for the IDE lifetime. Subscribes to a
 * lightweight version query per linked project; any server-side change fires
 * a sync cycle. Falls back to interval polling when the socket is down.
 */
@Service(Service.Level.APP)
class ConvexSyncService(private val scope: CoroutineScope) {
    companion object {
        private val log = logger<ConvexSyncService>()
        private const val VERSION_QUERY = "features/ide/queries:projectVersion"

        fun getInstance(): ConvexSyncService = ApplicationManager.getApplication().getService(ConvexSyncService::class.java)
    }

    private val socket = AtomicReference<ConvexSocket?>(null)

    // queryId → projectId, so transitions map back to the right project.
    private val projectByQueryId = AtomicReference<Map<Int, String>>(emptyMap())

    // projectId → queryId; makes watch idempotent across reconnects.
    private val queryIdByProject = AtomicReference<Map<String, Int>>(emptyMap())

    @Synchronized
    fun ensureStarted() {
        if (socket.get() != null) return
        start()
    }

    fun socketOrNull(): ConvexSocket? = socket.get()

    fun stop() {
        socket.getAndSet(null)?.stop()
        SyncState.realtimeConnected = false
    }

    @Synchronized
    fun restartForAuthChange() {
        stop()
        projectByQueryId.set(emptyMap())
        queryIdByProject.set(emptyMap())
        ensureStarted()
        for (project in com.intellij.openapi.project.ProjectManager.getInstance().openProjects) {
            dev.envpilot.jetbrains.sync.LinkedProjectsService.getInstance(project).all()
                .forEach { watchProject(it.projectId) }
        }
    }

    /** Idempotent: one version query per Envpilot project. The socket replays its set on connect. */
    @Synchronized
    fun watchProject(projectId: String) {
        if (queryIdByProject.get().containsKey(projectId)) return
        val s = socket.get() ?: return
        val queryId = s.subscribe(VERSION_QUERY, mapOf("projectId" to projectId))
        projectByQueryId.updateAndGet { it + (queryId to projectId) }
        queryIdByProject.updateAndGet { it + (projectId to queryId) }
    }

    private fun start() {
        val deploymentUrl =
            EnvpilotSettings.getInstance().state.convexUrl.ifBlank {
                dev.envpilot.jetbrains.BuildConfig.CONVEX_URL
            }
        if (deploymentUrl.isBlank()) {
            log.warn("Real-time sync disabled: no Convex URL configured")
            return
        }
        val socket = ConvexSocket(deploymentUrl, { AuthService.getInstance().getFreshToken(false) }, listener())
        this.socket.set(socket)
        socket.start()
    }

    private fun listener() =
        object : ConvexSocket.Listener {
            override fun onQueryUpdated(queryId: Int) {
                val projectId = projectByQueryId.get()[queryId] ?: return
                scope.launch(Dispatchers.IO) {
                    for (project in com.intellij.openapi.project.ProjectManager.getInstance().openProjects) {
                        val links =
                            dev.envpilot.jetbrains.sync.LinkedProjectsService
                                .getInstance(project).all()
                        if (links.any { it.projectId == projectId }) {
                            SyncScheduler.getInstance().runCycle(project)
                            break
                        }
                    }
                }
            }

            override fun onQueryFailed(queryId: Int) {
                log.warn("Convex version query failed for ${projectByQueryId.get()[queryId]}")
            }

            override fun onAuthError(error: String) {
                log.warn("Convex socket auth error: $error — forcing token refresh")
                scope.launch(Dispatchers.IO) {
                    AuthService.getInstance().getFreshToken(force = true)?.let { token ->
                        socket.get()?.reauthenticate(token)
                    }
                }
            }

            override fun onConnected() {
                // The socket replays its own subscription set on reconnect.
                SyncState.realtimeConnected = true
                SyncState.notifyChanged()
            }

            override fun onDisconnected() {
                SyncState.realtimeConnected = false
                SyncState.notifyChanged()
            }
        }
}
