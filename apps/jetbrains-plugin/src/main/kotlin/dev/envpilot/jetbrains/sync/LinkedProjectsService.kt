package dev.envpilot.jetbrains.sync

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.StoragePathMacros
import com.intellij.openapi.project.Project

data class LinkedProject(
    var orgId: String = "",
    var orgName: String = "",
    var projectId: String = "",
    var projectName: String = "",
    var environment: String = "development",
    var targetFile: String = "",
    var includeSecretFiles: Boolean = true,
    var directoryPath: String = "",
    var deviceId: String = "",
    var accountId: String = "",
)

@Service(Service.Level.PROJECT)
@State(
    name = "EnvpilotLinkedProjects",
    storages = [Storage(StoragePathMacros.WORKSPACE_FILE), Storage(value = "EnvpilotPlugin.xml", deprecated = true)],
)
class LinkedProjectsService : PersistentStateComponent<LinkedProjectsService.State> {
    class State {
        var links: MutableList<LinkedProject> = mutableListOf()
    }

    private var state = State()

    private var normalizedFor: String? = null

    @Synchronized
    override fun getState(): State = state

    @Synchronized
    override fun loadState(s: State) {
        state = s
        normalizedFor = null
    }

    @Synchronized
    fun all(): List<LinkedProject> {
        val accountId = dev.envpilot.jetbrains.auth.AuthService.getInstance().userId ?: return emptyList()
        if (normalizedFor != accountId) normalize(accountId)
        return state.links.filter { it.accountId == accountId }
    }

    @Synchronized
    internal fun normalize(accountId: String) {
        val claimed = state.links.map { if (it.accountId.isBlank()) it.copy(accountId = accountId) else it }
        val byDirectory = claimed.filter { it.accountId == accountId }.groupBy { it.directoryPath }
        write(
            claimed.map { link ->
                val group = byDirectory[link.directoryPath]?.takeIf { link.accountId == accountId } ?: return@map link
                link.copy(
                    includeSecretFiles = group.first() === link,
                    targetFile = if (group.size > 1) conventionalTargetFileFor(link.environment, group.size) else link.targetFile,
                )
            },
        )
        normalizedFor = accountId
    }

    @Synchronized
    fun contains(link: LinkedProject): Boolean {
        val accountId = link.accountId.ifBlank { dev.envpilot.jetbrains.auth.AuthService.getInstance().userId ?: return false }
        return state.links.any { same(it, link.copy(accountId = accountId)) }
    }

    @Synchronized
    fun add(link: LinkedProject): Boolean {
        val accountId = link.accountId.ifBlank { dev.envpilot.jetbrains.auth.AuthService.getInstance().userId ?: return false }
        val owned = link.copy(accountId = accountId)
        if (contains(owned)) return false
        write(state.links + owned)
        normalizedFor = null
        return true
    }

    @Synchronized
    fun remove(link: LinkedProject): Boolean {
        val kept = state.links.filterNot { same(it, link) }
        if (kept.size == state.links.size) return false
        write(kept)
        normalizedFor = null
        return true
    }

    @Synchronized
    fun recordDevice(
        link: LinkedProject,
        deviceId: String,
    ): LinkedProject {
        val updated = link.copy(deviceId = deviceId)
        write(state.links.map { if (same(it, link)) it.copy(deviceId = deviceId) else it })
        return updated
    }

    private fun same(
        a: LinkedProject,
        b: LinkedProject,
    ) = a.accountId == b.accountId && a.projectId == b.projectId && a.environment == b.environment &&
        a.directoryPath == b.directoryPath

    private fun write(links: List<LinkedProject>) {
        state = State().also { it.links = links.toMutableList() }
    }

    companion object {
        fun getInstance(project: Project): LinkedProjectsService = project.getService(LinkedProjectsService::class.java)
    }
}

object JetBrainsDevice {
    private const val DEVICE_ID_KEY = "dev.envpilot.deviceId"

    fun id(): String {
        val properties = com.intellij.ide.util.PropertiesComponent.getInstance()
        return properties.getValue(DEVICE_ID_KEY) ?: "jetbrains_${java.util.UUID.randomUUID()}".also {
            properties.setValue(DEVICE_ID_KEY, it)
        }
    }

    fun name(): String =
        "${com.intellij.openapi.application.ApplicationInfo.getInstance().fullApplicationName} " +
            "(${System.getProperty("os.name")})"
}

fun targetFileFor(link: LinkedProject): String =
    link.targetFile.ifBlank {
        dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.targetFile.ifBlank { ".env.local" }
    }

fun conventionalTargetFileFor(
    environment: String,
    selectedEnvironmentCount: Int,
): String =
    if (selectedEnvironmentCount == 1) {
        dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.targetFile.ifBlank { ".env.local" }
    } else if (environment == "development") {
        ".env.local"
    } else {
        ".env.$environment"
    }
