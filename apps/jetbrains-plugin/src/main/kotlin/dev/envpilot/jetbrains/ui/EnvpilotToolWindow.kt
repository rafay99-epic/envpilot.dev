package dev.envpilot.jetbrains.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.api.EnvpilotApi
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.model.Project as ApiProject
import dev.envpilot.jetbrains.model.VALID_ENVIRONMENTS
import dev.envpilot.jetbrains.sync.LinkedProject
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import dev.envpilot.jetbrains.sync.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.nio.file.Paths
import javax.swing.DefaultListModel
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JPanel

class EnvpilotToolWindowFactory : ToolWindowFactory {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = EnvpilotToolWindowPanel(project)
        val content = toolWindow.contentManager.factory
            .createContent(panel, "Envpilot", false)
        toolWindow.contentManager.addContent(content)
    }
}

class EnvpilotToolWindowPanel(private val project: Project) : JPanel() {

    companion object {
        private val log = logger<EnvpilotToolWindowPanel>()
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val listModel = DefaultListModel<String>()
    private val items = mutableListOf<Any>()
    private lateinit var list: JBList<String>

    init {
        layout = java.awt.BorderLayout()
        list = JBList(listModel)
        add(JBScrollPane(list), java.awt.BorderLayout.CENTER)

        Disposer.register(project) { scope.cancel() }
        reload()

        val toolbar = ActionManager.getInstance().createActionToolbar(
            "EnvpilotToolWindow",
            DefaultActionGroup().apply {
                add(refreshAction())
                add(linkAction())
                add(unlinkAction())
                add(pullAction())
            },
            true
        )
        toolbar.targetComponent = this
        add(toolbar.component, java.awt.BorderLayout.NORTH)
    }

    private fun refreshAction() = object : AnAction("Refresh", "Reload orgs and projects", null) {
        override fun actionPerformed(e: AnActionEvent) = reload()
    }

    private fun linkAction() = object : AnAction("Link Directory…", "Link a directory to a project environment", null) {
        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled =
                AuthService.getInstance().email != null && selected() is ApiProject
        }

        override fun actionPerformed(e: AnActionEvent) {
            (selected() as? ApiProject)?.let { LinkDirectoryDialog(project, it).show() }
        }
    }

    private fun unlinkAction() = object : AnAction("Unlink", "Remove this directory link", null) {
        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled = selected() is LinkedProject
        }

        override fun actionPerformed(e: AnActionEvent) {
            (selected() as? LinkedProject)?.let { link ->
                LinkedProjectsService.getInstance(project).remove(link)
                reload()
            }
        }
    }

    private fun pullAction() = object : AnAction("Pull Now", "Sync all linked directories in this project", null) {
        override fun actionPerformed(e: AnActionEvent) {
            scope.launch { SyncScheduler.getInstance().runCycle(project) }
        }
    }

    /** Fetch on IO, mutate the Swing model on the EDT. */
    private fun reload() {
        scope.launch {
            val rows: List<Pair<String, Any>> = try {
                fetchRows()
            } catch (e: Exception) {
                log.warn("Reload failed", e)
                val msg = e.message?.takeIf { it.isNotBlank() }
                    ?: e::class.simpleName ?: "unknown error"
                listOf("Error: $msg" to Any())
            }
            ApplicationManager.getApplication().invokeLater {
                items.clear()
                items.addAll(rows.map { it.second })
                listModel.clear()
                rows.forEach { listModel.addElement(it.first) }
            }
        }
    }

    private suspend fun fetchRows(): List<Pair<String, Any>> {
        val auth = AuthService.getInstance()
        if (auth.getSession() == null) return listOf(
            "Not signed in — use Tools ▸ Envpilot ▸ Sign In" to Any()
        )
        val api = EnvpilotApi(EnvpilotSettings.getInstance().effectiveServerUrl()) { force ->
            auth.getFreshToken(force)
        }
        val linksByProject = LinkedProjectsService.getInstance(project).all().groupBy { it.projectId }
        val rows = mutableListOf<Pair<String, Any>>()
        for (org in api.orgs()) {
            rows.add("Org: ${org.name} (${org.slug})" to org)
            for (proj in api.projects(org.id)) {
                rows.add("  Project: ${proj.name} (${proj.variableCount} vars)" to proj)
                for (link in linksByProject[proj.id].orEmpty()) {
                    rows.add("      ${link.environment} → ${link.directoryPath}" to link)
                }
            }
        }
        return rows
    }

    private fun selected(): Any? =
        list.selectedIndex.takeIf { it >= 0 && it < items.size }?.let { items[it] }
}

class LinkDirectoryDialog(
    private val project: Project,
    private val selected: ApiProject,
) : DialogWrapper(project) {

    private val envCombo = JComboBox(VALID_ENVIRONMENTS.toTypedArray())
    private var chosenDir: String? = null

    init {
        title = "Link ${selected.name}"
        init()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel(java.awt.GridLayout(0, 1))
        panel.add(javax.swing.JLabel("Environment:"))
        panel.add(envCombo)
        val dirLabel = javax.swing.JLabel("Directory: (project root)")
        val chooseButton = javax.swing.JButton("Choose…")
        chooseButton.addActionListener {
            val chooser = com.intellij.openapi.fileChooser.FileChooserFactory.getInstance()
                .createFileChooser(
                    com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
                        .createSingleFolderDescriptor(),
                    project,
                    null
                )
            val files = chooser.choose(project)
            files.firstOrNull()?.let {
                chosenDir = java.io.File(it.path).canonicalPath
                dirLabel.text = "Directory: $chosenDir"
            }
        }
        panel.add(dirLabel)
        panel.add(chooseButton)
        return panel
    }

    override fun doOKAction() {
        val dir = chosenDir ?: Paths.get(project.basePath ?: "").toAbsolutePath().toString()
        val added = LinkedProjectsService.getInstance(project).add(
            LinkedProject(
                projectId = selected.id,
                projectName = selected.name,
                environment = envCombo.selectedItem as String,
                directoryPath = dir,
            )
        )
        if (!added) {
            com.intellij.notification.NotificationGroupManager.getInstance()
                .getNotificationGroup("dev.envpilot.notifications")
                .createNotification(
                    "This project/environment/directory is already linked.",
                    com.intellij.notification.NotificationType.WARNING
                )
                .notify(project)
        }
        super.doOKAction()
    }
}
