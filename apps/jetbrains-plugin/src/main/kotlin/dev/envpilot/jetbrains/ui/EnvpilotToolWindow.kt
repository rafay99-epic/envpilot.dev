package dev.envpilot.jetbrains.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.icons.AllIcons
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
import dev.envpilot.jetbrains.editor.EnvEditorService
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
        list.cellRenderer = com.intellij.ui.SimpleListCellRenderer.create { label, value, index ->
            label.text = value
            label.icon = when (val item = items.getOrNull(index)) {
                is dev.envpilot.jetbrains.model.Org -> AllIcons.Nodes.Module
                is ApiProject -> projectIcon(item.id)
                is LinkedProject -> linkIcon(item)
                else -> null
            }
        }
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
                add(revealAction())
                add(requestVariableAction())
            },
            true
        )
        toolbar.targetComponent = this
        add(toolbar.component, java.awt.BorderLayout.NORTH)
    }

    private fun refreshAction() = object : AnAction("Refresh", "Reload orgs and projects", AllIcons.Actions.Refresh) {
        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled = AuthService.getInstance().email != null
        }

        override fun actionPerformed(e: AnActionEvent) = reload()
    }

    private fun linkAction() = object : AnAction("Link Directory…", "Link a directory to a project environment", AllIcons.General.Add) {
        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled =
                AuthService.getInstance().email != null && selected() is ApiProject
        }

        override fun actionPerformed(e: AnActionEvent) {
            (selected() as? ApiProject)?.let { LinkDirectoryDialog(project, it).show() }
        }
    }

    private fun unlinkAction() = object : AnAction("Unlink", "Remove this directory link", AllIcons.General.Remove) {
        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled = selected() is LinkedProject
        }

        override fun actionPerformed(e: AnActionEvent) {
            (selected() as? LinkedProject)?.let { link ->
                LinkedProjectsService.getInstance(project).remove(link)
                notifyBalloon(
                    project,
                    "Unlinked ${link.projectName} (${link.environment}) from ${link.directoryPath}. " +
                        "The env file stays on disk until the IDE closes.",
                    com.intellij.notification.NotificationType.INFORMATION
                )
                reload()
            }
        }
    }

    private fun pullAction() = object : AnAction("Pull Now", "Sync all linked directories in this project", AllIcons.Actions.Download) {
        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled = AuthService.getInstance().email != null &&
                LinkedProjectsService.getInstance(project).all().isNotEmpty()
        }

        override fun actionPerformed(e: AnActionEvent) {
            scope.launch {
                val ok = SyncScheduler.getInstance().runCycle(project)
                notifyBalloon(
                    project,
                    if (ok) "Pull complete — all linked directories synced."
                    else "Pull failed: ${dev.envpilot.jetbrains.sync.SyncState.lastError ?: "unknown error"}",
                    if (ok) com.intellij.notification.NotificationType.INFORMATION
                    else com.intellij.notification.NotificationType.ERROR
                )
                refreshOpenEnvEditors(project)
            }
        }
    }

    private fun revealAction() = object : AnAction(
        "Reveal Values", "Show managed secret values in editors for 30 seconds", AllIcons.Actions.Preview
    ) {
        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled = AuthService.getInstance().email != null &&
                EnvEditorService.getInstance(project).managedPaths().isNotEmpty()
        }

        override fun actionPerformed(e: AnActionEvent) {
            EnvEditorService.getInstance(project).revealFor(30)
            refreshOpenEnvEditors(project)
        }
    }

    private fun requestVariableAction() = object : AnAction(
        "Request Variable…", "Submit a variable request for approval", AllIcons.Actions.AddFile
    ) {
        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled = AuthService.getInstance().email != null &&
                LinkedProjectsService.getInstance(project).all().isNotEmpty()
        }

        override fun actionPerformed(e: AnActionEvent) {
            val links = LinkedProjectsService.getInstance(project).all()
            val projects = links.distinctBy { it.projectId }
                .map { it.projectId to it.projectName }
            if (projects.isEmpty()) {
                com.intellij.notification.NotificationGroupManager.getInstance()
                    .getNotificationGroup("dev.envpilot.notifications")
                    .createNotification(
                        "Link a project directory first, then request variables for it.",
                        com.intellij.notification.NotificationType.WARNING
                    )
                    .notify(project)
                return
            }
            RequestVariableDialog(project, projects).show()
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
        val editorService = EnvEditorService.getInstance(project)
        val linksByProject = LinkedProjectsService.getInstance(project).all().groupBy { it.projectId }
        val rows = mutableListOf<Pair<String, Any>>()
        for (org in api.orgs()) {
            rows.add("Org: ${org.name} (${org.slug})" to org)
            // One flaky org must not blank out the whole tree.
            val projects = try {
                api.projects(org.id)
            } catch (e: Exception) {
                rows.add("      Load failed: ${e.message ?: e::class.simpleName} — hit Refresh" to org)
                continue
            }
            for (proj in projects) {
                rows.add("  Project: ${proj.name} (${proj.variableCount} vars)" to proj)
                for (link in linksByProject[proj.id].orEmpty()) {
                    val status = when (linkStatus(link)) {
                        EnvEditorService.LinkStatus.SYNCED -> "synced"
                        EnvEditorService.LinkStatus.DRIFTED -> "modified — next sync overwrites"
                        EnvEditorService.LinkStatus.NOT_PULLED -> "NOT PULLED"
                    }
                    rows.add("      ${link.environment} → ${link.directoryPath}  [$status]" to link)
                    // Secret files for this link: name, size, on-disk state.
                    val fileKey = "${link.projectId}:${link.environment}"
                    val metas = editorService.cachedFiles(fileKey) ?: run {
                        try {
                            api.listFiles(link.projectId, link.environment.takeIf { it.isNotBlank() })
                                .also { editorService.cacheFiles(fileKey, it) }
                        } catch (_: Exception) { null }
                    }
                    for (f in metas.orEmpty()) {
                        val onDisk = java.nio.file.Files.exists(
                            java.nio.file.Paths.get(link.directoryPath, f.path)
                        )
                        val kb = if (f.size >= 1024) "${f.size / 1024} KB" else "${f.size} B"
                        rows.add(
                            "          file: ${f.name} ($kb)  ${if (onDisk) "→ on disk" else "[NOT PULLED]"}" to link
                        )
                    }
                }
            }
        }
        return rows
    }

    private fun selected(): Any? =
        list.selectedIndex.takeIf { it >= 0 && it < items.size }?.let { items[it] }

    private fun targetPathFor(link: LinkedProject): String {
        val target = EnvpilotSettings.getInstance().state.targetFile.ifBlank { ".env.local" }
        return java.nio.file.Paths.get(link.directoryPath, target).toString()
    }

    private fun linkStatus(link: LinkedProject): EnvEditorService.LinkStatus =
        EnvEditorService.getInstance(project).statusFor(targetPathFor(link))

    private fun linkIcon(link: LinkedProject): javax.swing.Icon = when (linkStatus(link)) {
        EnvEditorService.LinkStatus.SYNCED -> AllIcons.General.InspectionsOK
        EnvEditorService.LinkStatus.DRIFTED -> AllIcons.General.BalloonWarning
        EnvEditorService.LinkStatus.NOT_PULLED -> AllIcons.General.BalloonWarning
    }

    private fun projectIcon(projectId: String): javax.swing.Icon {
        val links = LinkedProjectsService.getInstance(project).all().filter { it.projectId == projectId }
        if (links.isEmpty()) return AllIcons.Nodes.Project
        return when (links.all { linkStatus(it) == EnvEditorService.LinkStatus.SYNCED }) {
            true -> AllIcons.General.InspectionsOK
            false -> AllIcons.General.BalloonWarning
        }
    }
}

internal fun refreshOpenEnvEditors(project: Project) {
    ApplicationManager.getApplication().invokeLater {
        for (editor in com.intellij.openapi.fileEditor.FileEditorManager
                .getInstance(project).selectedEditors) {
            val file = editor.file ?: continue
            val textEditor = editor.asSafely<com.intellij.openapi.fileEditor.TextEditor>()?.editor ?: continue
            dev.envpilot.jetbrains.editor.EnvCloak.refresh(textEditor, project)
        }
    }
}

private inline fun <reified T> Any?.asSafely(): T? = this as? T

private fun notifyBalloon(project: Project, message: String, type: com.intellij.notification.NotificationType) {
    com.intellij.notification.NotificationGroupManager.getInstance()
        .getNotificationGroup("dev.envpilot.notifications")
        .createNotification(message, type)
        .notify(project)
}

class LinkDirectoryDialog(
    private val project: Project,
    private val selected: ApiProject,
) : DialogWrapper(project) {

    private var environment = VALID_ENVIRONMENTS.first()
    private val dirField = com.intellij.openapi.ui.TextFieldWithBrowseButton()
    private val pathPreview = javax.swing.JLabel()
    private val pullScope = kotlinx.coroutines.CoroutineScope(
        kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.IO
    )
    private var workspaceRoots: List<String> = emptyList()

    init {
        title = "Link ${selected.name} to a Directory"
        setOKButtonText("Link Directory")
        dirField.text = project.basePath ?: ""
        dirField.addBrowseFolderListener(
            "Choose Directory",
            "The Envpilot env file will be written into this directory.",
            project,
            com.intellij.openapi.fileChooser.FileChooserDescriptorFactory.createSingleFolderDescriptor()
        )
        dirField.childComponent.document.addDocumentListener(object : javax.swing.event.DocumentListener {
            override fun insertUpdate(e: javax.swing.event.DocumentEvent) = updatePathPreview()
            override fun removeUpdate(e: javax.swing.event.DocumentEvent) = updatePathPreview()
            override fun changedUpdate(e: javax.swing.event.DocumentEvent) = updatePathPreview()
        })
        workspaceRoots = detectWorkspaceRoots()
        updatePathPreview()
        init()
    }

    /** All content roots across modules — covers worktrees and multi-root setups. */
    private fun detectWorkspaceRoots(): List<String> =
        com.intellij.openapi.module.ModuleManager.getInstance(project).modules
            .flatMap { com.intellij.openapi.roots.ModuleRootManager.getInstance(it).contentRoots.toList() }
            .map { it.path }
            .distinct()
            .filter { it != null } as List<String>

    private fun updatePathPreview() {
        val base = dirField.text.trim().ifBlank { "?" }
        val target = EnvpilotSettings.getInstance().state.targetFile.ifBlank { ".env.local" }
        pathPreview.text =
            "<html><body style=\"margin:0\">Will write <code>${escapeHtml("$base/$target")}</code>" +
                " &nbsp;(${environment})</body></html>"
    }

    private fun escapeHtml(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    override fun createCenterPanel(): JComponent = com.intellij.ui.dsl.builder.panel {
        group("Project") {
            row("Name:") { label(selected.name) }
            row("Variables:") { label("${selected.variableCount} (all environments)") }
        }
        group("Link settings") {
            if (workspaceRoots.size > 1) {
                row("Workspace folders:") {
                    cell(javax.swing.JComboBox(workspaceRoots.toTypedArray())).onChanged {
                        (it as? javax.swing.JComboBox<*>)?.selectedItem?.let { root ->
                            dirField.text = root.toString()
                        }
                    }
                }.comment("Detected content roots (worktrees/modules) — picking one fills the field below.")
            }
            row("Environment:") {
                cell(javax.swing.JComboBox(VALID_ENVIRONMENTS.toTypedArray()))
                    .onChanged { environment = it.selectedItem as String }
            }.comment("Which environment's values to pull into this directory.")
            row("Directory:") {
                cell(dirField).align(com.intellij.ui.dsl.builder.AlignX.FILL)
            }.comment("Change the env file name in Settings ▸ Tools ▸ Envpilot.")
            row("Result:") { cell(pathPreview) }
        }
    }

    override fun doValidate(): com.intellij.openapi.ui.ValidationInfo? {
        if (dirField.text.isBlank()) {
            return com.intellij.openapi.ui.ValidationInfo("Directory is required", dirField)
        }
        val dir = java.io.File(dirField.text)
        if (!dir.exists() || !dir.isDirectory) {
            return com.intellij.openapi.ui.ValidationInfo("Directory does not exist", dirField)
        }
        return null
    }

    override fun doOKAction() {
        val dir = java.io.File(dirField.text).canonicalPath
        val added = LinkedProjectsService.getInstance(project).add(
            LinkedProject(
                projectId = selected.id,
                projectName = selected.name,
                environment = environment,
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
            super.doOKAction()
            return
        }
        // Pull immediately so the user sees the env file land — no hidden
        // "now go click Pull Now" step.
        pullScope.launch {
            val ok = SyncScheduler.getInstance().runCycle(project)
            refreshOpenEnvEditors(project)
            notifyBalloon(
                project,
                if (ok) "Linked ${selected.name} — env file pulled into $dir"
                else "Linked ${selected.name}, but the pull failed: ${dev.envpilot.jetbrains.sync.SyncState.lastError ?: "unknown error"}",
                if (ok) com.intellij.notification.NotificationType.INFORMATION
                else com.intellij.notification.NotificationType.ERROR
            )
        }
        val settings = EnvpilotSettings.getInstance().state
        if (settings.commitGuardAutoInstall) {
            val installed = dev.envpilot.jetbrains.guards.CommitGuard.install(
                dir,
                settings.targetFile.ifBlank { ".env.local" }
            )
            if (!installed) {
                com.intellij.notification.NotificationGroupManager.getInstance()
                    .getNotificationGroup("dev.envpilot.notifications")
                    .createNotification(
                        "Linked, but no git repository found — commit guard not installed.",
                        com.intellij.notification.NotificationType.WARNING
                    )
                    .notify(project)
            }
        }
        super.doOKAction()
    }
}
