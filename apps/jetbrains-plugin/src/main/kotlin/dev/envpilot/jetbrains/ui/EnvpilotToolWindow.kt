package dev.envpilot.jetbrains.ui

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.model.VALID_ENVIRONMENTS
import dev.envpilot.jetbrains.sync.LinkedProject
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import dev.envpilot.jetbrains.sync.SyncScheduler
import dev.envpilot.jetbrains.sync.targetFileFor
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
import dev.envpilot.jetbrains.model.Project as ApiProject

class EnvpilotToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(
        project: Project,
        toolWindow: ToolWindow,
    ) {
        val panel = EnvpilotToolWindowPanel(project)
        val content =
            toolWindow.contentManager.factory
                .createContent(panel, "Envpilot", false)
        toolWindow.contentManager.addContent(content)
    }
}

class EnvpilotToolWindowPanel(private val project: Project) : JPanel() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val listModel = DefaultListModel<String>()
    private val items = mutableListOf<Any>()
    private val accessibleProjects = java.util.concurrent.ConcurrentHashMap<String, ApiProject>()
    private lateinit var list: JBList<String>
    private val errorBanner =
        javax.swing.JPanel(java.awt.BorderLayout()).apply { isVisible = false }
    private val errorLabel =
        javax.swing.JLabel("", com.intellij.icons.AllIcons.General.BalloonWarning, javax.swing.JLabel.LEFT)

    init {
        layout = java.awt.BorderLayout()
        list = JBList(listModel)
        list.emptyText.text = "Loading your organizations…"
        list.emptyText.appendSecondaryText(
            "Use Tools ▸ Envpilot ▸ Sign In if you're not signed in yet.",
            com.intellij.ui.SimpleTextAttributes.GRAYED_ATTRIBUTES,
            null,
        )
        list.cellRenderer =
            com.intellij.ui.SimpleListCellRenderer.create { label, value, index ->
                label.text = value
                label.icon =
                    when (val item = items.getOrNull(index)) {
                        is dev.envpilot.jetbrains.model.Org -> AllIcons.Nodes.Module
                        is ApiProject -> projectIcon(item.id)
                        is LinkedProject -> linkIcon(item)
                        else -> null
                    }
            }
        add(JBScrollPane(list), java.awt.BorderLayout.CENTER)

        errorBanner.background = javax.swing.UIManager.getColor("Panel.background")
        errorBanner.border =
            javax.swing.border.CompoundBorder(
                javax.swing.border.MatteBorder(0, 0, 1, 0, javax.swing.UIManager.getColor("Component.borderColor")),
                javax.swing.border.EmptyBorder(8, 12, 8, 12),
            )
        val retry = javax.swing.JButton("Retry")
        retry.isFocusable = false
        retry.margin = java.awt.Insets(2, 10, 2, 10)
        retry.addActionListener {
            hideError()
            reload()
        }
        errorBanner.add(errorLabel, java.awt.BorderLayout.CENTER)
        errorBanner.add(retry, java.awt.BorderLayout.EAST)
        add(errorBanner, java.awt.BorderLayout.SOUTH)

        Disposer.register(project) { scope.cancel() }
        reload()

        val toolbar =
            ActionManager.getInstance().createActionToolbar(
                "EnvpilotToolWindow",
                DefaultActionGroup().apply {
                    add(refreshAction())
                    add(linkAction())
                    add(unlinkAction())
                    add(pullAction())
                    add(revealAction())
                    add(requestVariableAction())
                },
                true,
            )
        toolbar.targetComponent = this
        add(toolbar.component, java.awt.BorderLayout.NORTH)
    }

    private fun refreshAction() =
        object : AnAction("Refresh", "Reload orgs and projects", AllIcons.Actions.Refresh) {
            override fun update(e: AnActionEvent) {
                e.presentation.isEnabled = AuthService.getInstance().email != null
            }

            override fun actionPerformed(e: AnActionEvent) = reload()
        }

    private fun linkAction() =
        object : AnAction("Link Directory…", "Link a directory to a project environment", AllIcons.General.Add) {
            override fun update(e: AnActionEvent) {
                val selectedProject = selected() as? ApiProject
                e.presentation.isEnabled =
                    AuthService.getInstance().email != null &&
                    selectedProject != null &&
                    EnvEditorService.getInstance(project).hasAccessMeta(selectedProject.id) &&
                    EnvEditorService.getInstance(project).allowedEnvironments(selectedProject.id).isNotEmpty()
            }

            override fun actionPerformed(e: AnActionEvent) {
                (selected() as? ApiProject)?.let {
                    LinkDirectoryDialog(
                        project,
                        it,
                        EnvEditorService.getInstance(project).allowedEnvironments(it.id),
                    ).show()
                }
            }
        }

    private fun unlinkAction() =
        object : AnAction("Unlink", "Remove this directory link", AllIcons.General.Remove) {
            override fun update(e: AnActionEvent) {
                e.presentation.isEnabled = selected() is LinkedProject
            }

            override fun actionPerformed(e: AnActionEvent) {
                (selected() as? LinkedProject)?.let { link ->
                    scope.launch {
                        try {
                            val links = LinkedProjectsService.getInstance(project)
                            val lastProjectLink = links.all().none { it !== link && it.projectId == link.projectId }
                            if (lastProjectLink && link.deviceId.isNotBlank()) {
                                dev.envpilot.jetbrains.convex.ConvexApi.unlinkDevice(link.projectId, link.deviceId)
                            }
                            links.remove(link)
                            notifyBalloon(
                                project,
                                "Unlinked ${link.projectName} (${link.environment}) from ${link.directoryPath}. " +
                                    "Managed files follow the project's Convex unsync policy.",
                                com.intellij.notification.NotificationType.INFORMATION,
                            )
                            reload()
                        } catch (error: Exception) {
                            dev.envpilot.jetbrains.errors.Errors.report(error, mapOf("surface" to "unlink"))
                            notifyBalloon(
                                project,
                                "Unlink failed: ${dev.envpilot.jetbrains.errors.Errors.friendly(error)}",
                                com.intellij.notification.NotificationType.ERROR,
                            )
                        }
                    }
                }
            }
        }

    private fun pullAction() =
        object : AnAction("Pull Now", "Sync all linked directories in this project", AllIcons.Actions.Download) {
            override fun update(e: AnActionEvent) {
                e.presentation.isEnabled = AuthService.getInstance().email != null &&
                    LinkedProjectsService.getInstance(project).all().isNotEmpty()
            }

            override fun actionPerformed(e: AnActionEvent) {
                scope.launch {
                    val ok = SyncScheduler.getInstance().runCycle(project)
                    notifyBalloon(
                        project,
                        if (ok) {
                            "Pull complete — all linked directories synced."
                        } else {
                            "Pull failed: ${dev.envpilot.jetbrains.sync.SyncState.lastError ?: "unknown error"}"
                        },
                        if (ok) {
                            com.intellij.notification.NotificationType.INFORMATION
                        } else {
                            com.intellij.notification.NotificationType.ERROR
                        },
                    )
                    refreshOpenEnvEditors(project)
                }
            }
        }

    private fun revealAction() =
        object : AnAction(
            "Reveal Values",
            "Show managed secret values in editors for 30 seconds",
            AllIcons.Actions.Preview,
        ) {
            override fun update(e: AnActionEvent) {
                val projectIds = LinkedProjectsService.getInstance(project).all().map { it.projectId }.distinct()
                e.presentation.isEnabled = AuthService.getInstance().email != null &&
                    EnvEditorService.getInstance(project).managedPaths().isNotEmpty() &&
                    EnvEditorService.getInstance(project).canReveal(projectIds)
            }

            override fun actionPerformed(e: AnActionEvent) {
                scope.launch {
                    val links = LinkedProjectsService.getInstance(project).all().distinctBy { it.projectId }
                    val editor = EnvEditorService.getInstance(project)
                    try {
                        for (link in links) {
                            val result = ConvexApi.accessMeta(link.projectId)
                            editor.cacheAccessMeta(link.projectId, result)
                        }
                        if (!editor.canReveal(links.map { it.projectId })) {
                            notifyBalloon(
                                project,
                                "Your role does not allow revealing secret values.",
                                com.intellij.notification.NotificationType.WARNING,
                            )
                            return@launch
                        }
                        editor.revealFor(30)
                        refreshOpenEnvEditors(project)
                        kotlinx.coroutines.delay(30_000)
                        refreshOpenEnvEditors(project)
                    } catch (error: Exception) {
                        notifyBalloon(
                            project,
                            dev.envpilot.jetbrains.errors.Errors.friendly(error),
                            com.intellij.notification.NotificationType.ERROR,
                        )
                    }
                }
            }
        }

    private fun requestVariableAction() =
        object : AnAction(
            "Request Variable…",
            "Submit a variable request for approval",
            AllIcons.Actions.AddFile,
        ) {
            override fun update(e: AnActionEvent) {
                val editor = EnvEditorService.getInstance(project)
                e.presentation.isEnabled =
                    AuthService.getInstance().email != null &&
                    accessibleProjects.keys.any { editor.hasCapability(it, "project.requests.submit") }
            }

            override fun actionPerformed(e: AnActionEvent) {
                val editor = EnvEditorService.getInstance(project)
                val projects =
                    accessibleProjects.values
                        .filter { editor.hasCapability(it.id, "project.requests.submit") }
                        .sortedBy { it.name.lowercase() }
                        .map {
                            RequestProject(it.id, it.name, editor.allowedEnvironments(it.id))
                        }
                if (projects.isEmpty()) {
                    com.intellij.notification.NotificationGroupManager.getInstance()
                        .getNotificationGroup("dev.envpilot.notifications")
                        .createNotification(
                            "Your current project access does not allow variable requests.",
                            com.intellij.notification.NotificationType.WARNING,
                        )
                        .notify(project)
                    return
                }
                RequestVariableDialog(project, projects).show()
            }
        }

    /** Fetch on IO, mutate the Swing model on the EDT. */
    private val reloadGeneration = java.util.concurrent.atomic.AtomicLong(0)

    private fun reload() {
        val generation = reloadGeneration.incrementAndGet()
        scope.launch {
            var rows: List<Pair<String, Any>>? = null
            var failure: String? = null
            try {
                rows = fetchRows()
            } catch (e: Exception) {
                dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "tool-window"))
                failure = dev.envpilot.jetbrains.errors.Errors.friendly(e)
            }
            ApplicationManager.getApplication().invokeLater {
                // A newer reload supersedes this one.
                if (generation != reloadGeneration.get()) return@invokeLater
                if (failure != null) {
                    showError(failure)
                    return@invokeLater
                }
                hideError()
                items.clear()
                items.addAll(rows!!.map { it.second })
                listModel.clear()
                rows.forEach { listModel.addElement(it.first) }
                list.emptyText.clear()
                if (rows.isEmpty()) {
                    list.emptyText.text = "No organizations to show yet."
                    list.emptyText.appendSecondaryText(
                        "Create one at envpilot.dev, then hit Refresh.",
                        com.intellij.ui.SimpleTextAttributes.GRAYED_ATTRIBUTES,
                        null,
                    )
                }
            }
        }
    }

    private fun showError(message: String) {
        errorLabel.text = message
        errorBanner.isVisible = true
        items.clear()
        listModel.clear()
        list.emptyText.clear()
        list.emptyText.text = "Couldn't load your Envpilot data."
    }

    private fun hideError() {
        errorBanner.isVisible = false
    }

    private suspend fun fetchRows(): List<Pair<String, Any>> {
        if (AuthService.getInstance().getSession() == null) {
            return listOf(
                "Not signed in — use Tools ▸ Envpilot ▸ Sign In" to Any(),
            )
        }
        val editorService = EnvEditorService.getInstance(project)
        val linksByProject = LinkedProjectsService.getInstance(project).all().groupBy { it.projectId }
        val rows = mutableListOf<Pair<String, Any>>()
        accessibleProjects.clear()
        for (org in ConvexApi.orgs()) {
            rows.add("Org: ${org.name} (${org.slug})" to org)
            // One flaky org must not blank out the whole tree.
            val projects =
                try {
                    ConvexApi.projects(org.id)
                } catch (e: Exception) {
                    rows.add(
                        "      ⚠ ${dev.envpilot.jetbrains.errors.Errors.friendly(e)} (hit Refresh)" to org,
                    )
                    continue
                }
            for (proj in projects) {
                accessibleProjects[proj.id] = proj
                runCatching { ConvexApi.accessMeta(proj.id) }
                    .onSuccess { editorService.cacheAccessMeta(proj.id, it) }
                rows.add("  Project: ${proj.name} (${proj.variableCount} vars)" to proj)
                rows.addAll(rowsForLink(editorService, linksByProject[proj.id].orEmpty()))
            }
        }
        return rows
    }

    private suspend fun rowsForLink(
        editorService: EnvEditorService,
        links: List<LinkedProject>,
    ): List<Pair<String, Any>> {
        val rows = mutableListOf<Pair<String, Any>>()
        for (link in links) {
            val status =
                when (linkStatus(link)) {
                    EnvEditorService.LinkStatus.SYNCED -> "synced"
                    EnvEditorService.LinkStatus.DRIFTED -> "modified — next sync overwrites"
                    EnvEditorService.LinkStatus.NOT_PULLED -> "NOT PULLED"
                }
            rows.add("      ${link.environment} → ${link.directoryPath}  [$status]" to link)
            rows.addAll(secretFileRows(editorService, link))
            rows.addAll(variableKeyRows(editorService, link))
        }
        return rows
    }

    private suspend fun secretFileRows(
        editorService: EnvEditorService,
        link: LinkedProject,
    ): List<Pair<String, Any>> {
        val fileKey = "${link.projectId}:${link.environment}"
        val metas =
            editorService.cachedFiles(fileKey) ?: run {
                try {
                    ConvexApi.listFiles(link.projectId, link.environment.takeIf { it.isNotBlank() })
                        .also { editorService.cacheFiles(fileKey, it) }
                } catch (_: Exception) {
                    null
                }
            }
        return metas.orEmpty().map { f ->
            val onDisk =
                java.nio.file.Files.exists(
                    java.nio.file.Paths.get(link.directoryPath, f.path),
                )
            val kb = if (f.size >= 1024) "${f.size / 1024} KB" else "${f.size} B"
            "          file: ${f.name} ($kb)  ${if (onDisk) "→ on disk" else "[NOT PULLED]"}" to link
        }
    }

    private suspend fun variableKeyRows(
        editorService: EnvEditorService,
        link: LinkedProject,
    ): List<Pair<String, Any>> {
        val keys =
            editorService.cachedKeys(link.projectId) ?: run {
                try {
                    val result =
                        ConvexApi.pullValues(
                            link.projectId,
                            link.environment.takeIf { it.isNotBlank() },
                            metadataOnly = true,
                        )
                    editorService.cacheAccessMeta(link.projectId, result.meta)
                    result.variables.map { it.key }.toSet().also { editorService.cacheKeys(link.projectId, it) }
                } catch (_: Exception) {
                    null
                }
            } ?: return emptyList()
        val rows = keys.sorted().take(10).map { "            var: $it" to link }
        if (keys.size > 10) {
            return rows + ("            … +${keys.size - 10} more" to link)
        }
        return rows
    }

    private fun selected(): Any? = list.selectedIndex.takeIf { it >= 0 && it < items.size }?.let { items[it] }

    private fun targetPathFor(link: LinkedProject): String {
        return java.nio.file.Paths.get(link.directoryPath, targetFileFor(link)).toString()
    }

    private fun linkStatus(link: LinkedProject): EnvEditorService.LinkStatus =
        EnvEditorService.getInstance(project).statusFor(targetPathFor(link))

    private fun linkIcon(link: LinkedProject): javax.swing.Icon =
        when (linkStatus(link)) {
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

private fun notifyBalloon(
    project: Project,
    message: String,
    type: com.intellij.notification.NotificationType,
) {
    com.intellij.notification.NotificationGroupManager.getInstance()
        .getNotificationGroup("dev.envpilot.notifications")
        .createNotification(message, type)
        .notify(project)
}

class LinkDirectoryDialog(
    private val project: Project,
    private val selected: ApiProject,
    allowedEnvironments: List<String>,
) : DialogWrapper(project) {
    private val environmentChecks =
        VALID_ENVIRONMENTS.filter { it in allowedEnvironments }
            .map { it to javax.swing.JCheckBox(it.replaceFirstChar(Char::uppercase)) }
    private val dirField = com.intellij.openapi.ui.TextFieldWithBrowseButton()
    private val pathPreview = javax.swing.JLabel()
    private val pullScope =
        kotlinx.coroutines.CoroutineScope(
            kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.IO,
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
            com.intellij.openapi.fileChooser.FileChooserDescriptorFactory.createSingleFolderDescriptor(),
        )
        dirField.childComponent.document.addDocumentListener(
            object : javax.swing.event.DocumentListener {
                override fun insertUpdate(e: javax.swing.event.DocumentEvent) = updatePathPreview()

                override fun removeUpdate(e: javax.swing.event.DocumentEvent) = updatePathPreview()

                override fun changedUpdate(e: javax.swing.event.DocumentEvent) = updatePathPreview()
            },
        )
        workspaceRoots = detectWorkspaceRoots()
        environmentChecks.first().second.isSelected = true
        updatePathPreview()
        init()
    }

    /** All content roots across modules — covers worktrees and multi-root setups. */
    private fun detectWorkspaceRoots(): List<String> =
        com.intellij.openapi.module.ModuleManager.getInstance(project).modules
            .flatMap { com.intellij.openapi.roots.ModuleRootManager.getInstance(it).contentRoots.toList() }
            .map { it.path }
            .distinct()

    private fun updatePathPreview() {
        val base = dirField.text.trim().ifBlank { "?" }
        val environments = selectedEnvironments()
        val targets = environments.map { targetFileFor(it, environments.size) }
        pathPreview.text =
            "<html><body style=\"margin:0\">Will write " +
            targets.joinToString(", ") { "<code>${escapeHtml("$base/$it")}</code>" } +
            "</body></html>"
    }

    private fun escapeHtml(s: String): String = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    override fun createCenterPanel(): JComponent =
        com.intellij.ui.dsl.builder.panel {
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
                row("Environments:") {
                    environmentChecks.forEach { (_, check) ->
                        cell(check).onChanged { updatePathPreview() }
                    }
                }.comment("One env file is created per selected environment.")
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
        if (selectedEnvironments().isEmpty()) {
            return com.intellij.openapi.ui.ValidationInfo("Pick at least one environment", environmentChecks.first().second)
        }
        return null
    }

    override fun doOKAction() {
        val dir = java.io.File(dirField.text).canonicalPath
        val deviceId = dev.envpilot.jetbrains.sync.JetBrainsDevice.id()
        val environments = selectedEnvironments()
        val pending =
            environments.mapIndexed { index, environment ->
                LinkedProject(
                    orgId = selected.organizationId,
                    projectId = selected.id,
                    projectName = selected.name,
                    environment = environment,
                    targetFile = targetFileFor(environment, environments.size),
                    includeSecretFiles = index == 0,
                    directoryPath = dir,
                    deviceId = deviceId,
                    accountId = AuthService.getInstance().userId.orEmpty(),
                )
            }
        val links = LinkedProjectsService.getInstance(project)
        if (pending.all(links::contains)) {
            com.intellij.notification.NotificationGroupManager.getInstance()
                .getNotificationGroup("dev.envpilot.notifications")
                .createNotification(
                    "This project/environment/directory is already linked.",
                    com.intellij.notification.NotificationType.WARNING,
                )
                .notify(project)
            super.doOKAction()
            return
        }
        super.doOKAction()
        pullScope.launch {
            try {
                dev.envpilot.jetbrains.convex.ConvexApi.linkDevice(
                    selected.id,
                    deviceId,
                    dev.envpilot.jetbrains.sync.JetBrainsDevice.name(),
                )
                pending.forEach(links::add)
                dev.envpilot.jetbrains.convex.ConvexSyncService.getInstance().watchProject(selected.id)
                val ok = SyncScheduler.getInstance().runCycle(project)
                refreshOpenEnvEditors(project)
                notifyBalloon(
                    project,
                    if (ok) {
                        "Linked ${selected.name}. Pulled values into $dir."
                    } else {
                        "Linked ${selected.name}, but pull failed: ${dev.envpilot.jetbrains.sync.SyncState.lastError ?: "unknown error"}"
                    },
                    if (ok) {
                        com.intellij.notification.NotificationType.INFORMATION
                    } else {
                        com.intellij.notification.NotificationType.ERROR
                    },
                )
                val settings = EnvpilotSettings.getInstance().state
                if (settings.commitGuardAutoInstall) {
                    val installed =
                        dev.envpilot.jetbrains.guards.CommitGuard.install(dir)
                    if (!installed) {
                        notifyBalloon(
                            project,
                            "Linked, but no Git repository was found. Commit guard was not installed.",
                            com.intellij.notification.NotificationType.WARNING,
                        )
                    }
                }
            } catch (error: Exception) {
                dev.envpilot.jetbrains.errors.Errors.report(error, mapOf("surface" to "link"))
                notifyBalloon(
                    project,
                    "Link failed: ${dev.envpilot.jetbrains.errors.Errors.friendly(error)}",
                    com.intellij.notification.NotificationType.ERROR,
                )
            }
        }
    }

    private fun selectedEnvironments(): List<String> = environmentChecks.filter { it.second.isSelected }.map { it.first }
}
