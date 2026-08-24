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
    var directoryPath: String = "",
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

    fun all(): List<LinkedProject> = state.links.toList()

    fun add(link: LinkedProject): Boolean {
        val duplicate =
            state.links.any {
                it.projectId == link.projectId && it.environment == link.environment &&
                    it.directoryPath == link.directoryPath
            }
        if (duplicate) return false
        // Same project+environment+directory must not be linked twice.
        state.links.add(link)
        return true
    }

    fun remove(link: LinkedProject): Boolean = state.links.remove(link)

    companion object {
        fun getInstance(project: Project): LinkedProjectsService = project.getService(LinkedProjectsService::class.java)
    }
}
