package dev.envpilot.jetbrains.sync

import com.intellij.openapi.application.ApplicationManager
import com.intellij.util.messages.Topic

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

    @Volatile var realtimeConnected: Boolean = false

    fun markStart() {
        syncing = true
    }

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
