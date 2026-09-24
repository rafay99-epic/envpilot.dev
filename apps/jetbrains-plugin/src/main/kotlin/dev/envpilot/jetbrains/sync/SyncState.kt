package dev.envpilot.jetbrains.sync

import com.intellij.openapi.application.ApplicationManager
import com.intellij.util.messages.Topic
import java.util.concurrent.ConcurrentHashMap

interface SyncStateListener {
    fun syncStateChanged()
}

object SyncState {
    private data class Snapshot(
        val syncing: Boolean = false,
        val error: String? = null,
    )

    private val byProject = ConcurrentHashMap<String, Snapshot>()

    fun lastError(key: String): String? = byProject[key]?.error

    fun syncing(key: String): Boolean = byProject[key]?.syncing == true

    fun clear(key: String) {
        byProject.remove(key)
    }

    @Volatile var realtimeConnected: Boolean = false

    fun markStart(key: String) = update(key) { it.copy(syncing = true) }

    fun markSuccess(key: String) {
        byProject[key] = Snapshot()
    }

    fun markFailure(
        key: String,
        message: String,
    ) = update(key) { it.copy(syncing = false, error = message) }

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
