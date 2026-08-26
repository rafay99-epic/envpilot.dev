package dev.envpilot.jetbrains.config

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@State(name = "EnvpilotSettings", storages = [Storage("EnvpilotPlugin.xml")])
class EnvpilotSettings : PersistentStateComponent<EnvpilotSettings.State> {
    class State {
        var serverUrl: String = ""
        var autoSync: Boolean = true
        var syncIntervalSeconds: Int = 300
        var targetFile: String = ".env.local"
        var cloakValues: Boolean = true
        var autocompleteEnabled: Boolean = true
        var commitGuardEnabled: Boolean = false
        var commitGuardAutoInstall: Boolean = false
        var autoUnsyncOnClose: Boolean = true
        var conflictResolution: String = "merge"
        var idlePauseMinutes: Int = 0
        var convexUrl: String = ""
    }

    private var state = State()

    override fun getState(): State = state

    override fun loadState(s: State) {
        state = s
    }

    /** Effective server URL: user override wins over the build-baked default. */
    fun effectiveServerUrl(): String = state.serverUrl.trimEnd('/').ifBlank { dev.envpilot.jetbrains.BuildConfig.DEFAULT_SERVER_URL }

    companion object {
        fun getInstance(): EnvpilotSettings = ApplicationManager.getApplication().getService(EnvpilotSettings::class.java)
    }
}
