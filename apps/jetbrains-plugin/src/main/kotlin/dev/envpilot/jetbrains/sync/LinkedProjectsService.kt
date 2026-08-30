package dev.envpilot.jetbrains.sync

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
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
@State(name = "EnvpilotLinkedProjects", storages = [Storage("EnvpilotPlugin.xml")])
class LinkedProjectsService : PersistentStateComponent<LinkedProjectsService.State> {
    class State {
        var links: MutableList<LinkedProject> = mutableListOf()
    }

    private var state = State()

    override fun getState(): State = state

    override fun loadState(s: State) {
        state = s
    }

    fun all(): List<LinkedProject> {
        val accountId = dev.envpilot.jetbrains.auth.AuthService.getInstance().userId ?: return emptyList()
        state.links.filter { it.accountId.isBlank() }.forEach { it.accountId = accountId }
        val links = state.links.filter { it.accountId == accountId }
        normalizeDirectories(links)
        return links
    }

    fun contains(link: LinkedProject): Boolean {
        val accountId = link.accountId.ifBlank { dev.envpilot.jetbrains.auth.AuthService.getInstance().userId ?: return false }
        return state.links.any {
            it.accountId == accountId && it.projectId == link.projectId && it.environment == link.environment &&
                it.directoryPath == link.directoryPath
        }
    }

    fun add(link: LinkedProject): Boolean {
        if (link.accountId.isBlank()) {
            link.accountId = dev.envpilot.jetbrains.auth.AuthService.getInstance().userId ?: return false
        }
        if (contains(link)) return false
        state.links.add(link)
        return true
    }

    fun remove(link: LinkedProject): Boolean = state.links.remove(link)

    private fun normalizeDirectories(links: List<LinkedProject>) {
        links.groupBy { Triple(it.projectId, it.directoryPath, it.accountId) }.values.forEach { directoryLinks ->
            directoryLinks.forEachIndexed { index, link -> link.includeSecretFiles = index == 0 }
            if (directoryLinks.size > 1) {
                directoryLinks.forEach { link ->
                    link.targetFile = targetFileFor(link.environment, directoryLinks.size)
                }
            }
        }
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

fun targetFileFor(
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
