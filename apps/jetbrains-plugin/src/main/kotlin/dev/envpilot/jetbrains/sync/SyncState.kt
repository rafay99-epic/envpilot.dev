package dev.envpilot.jetbrains.sync

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.util.messages.Topic
import java.util.concurrent.ConcurrentHashMap

interface SyncStateListener {
    fun syncStateChanged()
}

/**
 * Sync status kept PER PROJECT — one project stuck on the network must not
 * report an error for the others. The app-wide accessors the status bar widget
 * reads are derived views over the per-project rows.
 */
object SyncState {
    private data class Snapshot(
        val syncing: Boolean = false,
        val error: String? = null,
        val lastSyncAtMs: Long = 0,
    )

    private val byProject = ConcurrentHashMap<String, Snapshot>()

    val syncing: Boolean get() = byProject.values.any { it.syncing }

    val lastError: String? get() = byProject.values.firstNotNullOfOrNull { it.error }

    val lastSyncAtMs: Long get() = byProject.values.maxOfOrNull { it.lastSyncAtMs } ?: 0L

    fun lastError(project: Project): String? = byProject[project.locationHash]?.error

    @Volatile var realtimeConnected: Boolean = false

    fun markStart(project: Project) = markStartFor(project.locationHash)

    fun markSuccess(project: Project) = markSuccessFor(project.locationHash)

    fun markFailure(
        project: Project,
        message: String,
    ) = markFailureFor(project.locationHash, message)

    internal fun markStartFor(key: String) = update(key) { it.copy(syncing = true) }

    internal fun markSuccessFor(key: String) {
        byProject[key] = Snapshot(syncing = false, error = null, lastSyncAtMs = System.currentTimeMillis())
    }

    internal fun markFailureFor(
        key: String,
        message: String,
    ) = update(key) { it.copy(syncing = false, error = message) }

    internal fun reset() = byProject.clear()

    private fun update(
        key: String,
        transform: (Snapshot) -> Snapshot,
    ) {
        byProject.compute(key) { _, current -> transform(current ?: Snapshot()) }
    }

    fun notifyChanged() {
        ApplicationManager.getApplication().messageBus
            .syncPublisher(SYNC_TOPIC).syncStateChanged()
    }

    val SYNC_TOPIC: Topic<SyncStateListener> =
        Topic.create("EnvpilotSyncStateChanged", SyncStateListener::class.java)
}
