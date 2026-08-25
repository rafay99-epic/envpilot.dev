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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicReference

/**
 * Real-time sync: one Convex WebSocket for the IDE lifetime. Subscribes to a
 * lightweight version query per linked project; any server-side change fires
 * a sync cycle. Falls back to interval polling automatically — the socket is
 * a doorbell, decrypted pulls stay on the audited REST path.
 */
@Service(Service.Level.APP)
class ConvexSyncService {
    companion object {
        private val log = logger<ConvexSyncService>()
        private const val VERSION_QUERY = "features/ide/queries:projectVersion"

        fun getInstance(): ConvexSyncService = ApplicationManager.getApplication().getService(ConvexSyncService::class.java)
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val socket = AtomicReference<ConvexSocket?>(null)

    // queryId → IDE project directory hash is resolved via args; we keep the
    // projectId per query so transitions map back to the right project.
    private val projectByQueryId = AtomicReference<Map<Int, String>>(emptyMap())

    fun ensureStarted() {
        if (!EnvpilotSettings.getInstance().state.realTimeSync) return
        if (socket.get() != null) return
        scope.launch { start() }
    }

    fun stop() {
        socket.getAndSet(null)?.stop()
        SyncState.realtimeConnected = false
    }

    /** (Re)subscribe a project to change notifications. */
    fun watchProject(projectId: String) {
        val s = socket.get() ?: return
        val queryId = s.subscribe(VERSION_QUERY, mapOf("projectId" to projectId))
        projectByQueryId.updateAndGet { it + (queryId to projectId) }
    }

    private suspend fun start() {
        val auth = AuthService.getInstance()
        val deploymentUrl =
            EnvpilotSettings.getInstance().state.convexUrl.ifBlank {
                dev.envpilot.jetbrains.BuildConfig.CONVEX_URL
            }
        if (deploymentUrl.isBlank()) {
            log.warn("Real-time sync disabled: no Convex URL configured")
            return
        }
        val socket = ConvexSocket(deploymentUrl, { auth.getFreshToken(false) }, listener())
        this.socket.set(socket)
        socket.start()
    }

    private fun listener() =
        object : ConvexSocket.Listener {
            override fun onQueryUpdated(queryId: Int) {
                val projectId = projectByQueryId.get()[queryId] ?: return
                scope.launch {
                    for (project in ApplicationManager.getApplication().let {
                        com.intellij.openapi.project.ProjectManager.getInstance().openProjects
                    }) {
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
                scope.launch {
                    AuthService.getInstance().getFreshToken(force = true)?.let { token ->
                        socket.get()?.reauthenticate(token)
                    }
                }
            }

            override fun onConnected() {
                SyncState.realtimeConnected = true
                SyncState.notifyChanged()
                // Re-subscribe everything on (re)connect.
                for (projectId in projectByQueryId.get().values.toSet()) {
                    watchProject(projectId)
                }
            }

            override fun onDisconnected() {
                SyncState.realtimeConnected = false
                SyncState.notifyChanged()
            }
        }
}
