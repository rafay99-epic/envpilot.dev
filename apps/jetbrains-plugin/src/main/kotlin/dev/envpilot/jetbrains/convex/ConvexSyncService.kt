package dev.envpilot.jetbrains.convex

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.ProjectManager
import dev.envpilot.jetbrains.BuildConfig
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import dev.envpilot.jetbrains.sync.SyncScheduler
import dev.envpilot.jetbrains.sync.SyncState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicReference

@Service(Service.Level.APP)
class ConvexSyncService(private val scope: CoroutineScope) : Disposable {
    companion object {
        private val log = logger<ConvexSyncService>()
        private const val VERSION_QUERY = "features/ide/queries:projectVersion"

        fun getInstance(): ConvexSyncService = ApplicationManager.getApplication().getService(ConvexSyncService::class.java)
    }

    private val socket = AtomicReference<ConvexSocket?>(null)
    private val projectByQueryId = AtomicReference<Map<Int, String>>(emptyMap())
    private val queryIdByProject = AtomicReference<Map<String, Int>>(emptyMap())

    @Synchronized
    fun ensureStarted() {
        if (socket.get() != null || AuthService.getInstance().userId == null) return
        start()
    }

    fun socketOrNull(): ConvexSocket? = socket.get()

    override fun dispose() = stop()

    private fun stop() {
        socket.getAndSet(null)?.stop()
        SyncState.realtimeConnected = false
    }

    @Synchronized
    fun restartForAuthChange() {
        stop()
        projectByQueryId.set(emptyMap())
        queryIdByProject.set(emptyMap())
        ensureStarted()
        for (project in ProjectManager.getInstance().openProjects) {
            LinkedProjectsService.getInstance(project).all().forEach { watchProject(it.projectId) }
        }
    }

    @Synchronized
    fun watchProject(projectId: String) {
        if (queryIdByProject.get().containsKey(projectId)) return
        val s = socket.get() ?: return
        val queryId = s.subscribe(VERSION_QUERY, mapOf("projectId" to projectId))
        projectByQueryId.updateAndGet { it + (queryId to projectId) }
        queryIdByProject.updateAndGet { it + (projectId to queryId) }
    }

    @Synchronized
    fun unwatchProject(projectId: String) {
        val queryId = queryIdByProject.get()[projectId] ?: return
        queryIdByProject.updateAndGet { it - projectId }
        projectByQueryId.updateAndGet { it - queryId }
        socket.get()?.unsubscribe(queryId)
    }

    private fun start() {
        val deploymentUrl = EnvpilotSettings.getInstance().state.convexUrl.ifBlank { BuildConfig.CONVEX_URL }
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
                    val project =
                        ProjectManager.getInstance().openProjects.firstOrNull { project ->
                            LinkedProjectsService.getInstance(project).all().any { it.projectId == projectId }
                        }
                    project?.let { SyncScheduler.getInstance().runCycle(it) }
                }
            }

            override fun onQueryFailed(queryId: Int) {
                log.warn("Convex version query failed for ${projectByQueryId.get()[queryId]}")
            }

            override fun onAuthError(error: String) {
                log.warn("Convex socket auth error: $error; forcing token refresh")
                scope.launch(Dispatchers.IO) {
                    AuthService.getInstance().getFreshToken(force = true)?.let { token ->
                        socket.get()?.reauthenticate(token)
                    }
                }
            }

            override fun onConnected() {
                SyncState.realtimeConnected = true
                SyncState.notifyChanged()
            }

            override fun onDisconnected() {
                SyncState.realtimeConnected = false
                SyncState.notifyChanged()
            }
        }
}
