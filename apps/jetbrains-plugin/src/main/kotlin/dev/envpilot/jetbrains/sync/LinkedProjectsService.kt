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
    private var normalized = false

    override fun getState(): State = state

    override fun loadState(s: State) {
        state = s
        normalized = false
    }

    fun all(): List<LinkedProject> {
        val accountId = dev.envpilot.jetbrains.auth.AuthService.getInstance().userId ?: return emptyList()
        if (!normalized) normalize(accountId)
        return state.links.filter { it.accountId == accountId }
    }

    /** Back-fill and de-conflict persisted rows once per change, never on every read. */
    internal fun normalize(accountId: String) {
        state.links.filter { it.accountId.isBlank() }.forEach { it.accountId = accountId }
        normalizeDirectories(state.links)
        normalized = true
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
        normalized = false
        return true
    }

    // Match on the stable key: callers routinely hold a copy taken before
    // normalization rewrote targetFile/includeSecretFiles.
    fun remove(link: LinkedProject): Boolean {
        val removed =
            state.links.removeAll {
                it.projectId == link.projectId && it.directoryPath == link.directoryPath &&
                    it.environment == link.environment && it.accountId == link.accountId
            }
        if (removed) normalized = false
        return removed
    }

    // Grouped by directory, not by project: two different projects sharing one
    // folder still have to land in different files and only one may own the
    // secret files.
    private fun normalizeDirectories(links: List<LinkedProject>) {
        links.groupBy { it.directoryPath to it.accountId }.values.forEach { directoryLinks ->
            directoryLinks.forEachIndexed { index, link -> link.includeSecretFiles = index == 0 }
            if (directoryLinks.size > 1) {
                directoryLinks.forEach { link ->
                    link.targetFile = conventionalTargetFileFor(link.environment, directoryLinks.size)
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

// Kept as a thin alias so ui/ keeps compiling; call conventionalTargetFileFor.
fun targetFileFor(
    environment: String,
    selectedEnvironmentCount: Int,
): String = conventionalTargetFileFor(environment, selectedEnvironmentCount)

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
