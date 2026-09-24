package dev.envpilot.jetbrains

import com.intellij.openapi.actionSystem.IdeActions
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import com.intellij.openapi.editor.actionSystem.EditorActionManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Key
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.editor.EnvCloak
import dev.envpilot.jetbrains.guards.CopyGuardHandler
import dev.envpilot.jetbrains.sync.SyncScheduler
import dev.envpilot.jetbrains.version.VersionCheck
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

class StartupActivity : ProjectActivity {
    companion object {
        private val guardsInstalled = AtomicBoolean(false)
        private val purgeInstalled = AtomicBoolean(false)
        private val hoverInstalled = AtomicBoolean(false)
        private val originalCopyHandler = AtomicReference<EditorActionHandler?>(null)
        private val originalCutHandler = AtomicReference<EditorActionHandler?>(null)
        private val LAST_HOVER_AT = Key.create<Long>("envpilot.lastHoverAt")
    }

    override suspend fun execute(project: Project) {
        dev.envpilot.jetbrains.errors.Errors.init()
        AuthService.getInstance().initialize()

        SyncScheduler.getInstance().launch {
            VersionCheck.currentVersion()?.let { current ->
                VersionCheck.check(current)
            }
        }

        SyncScheduler.getInstance().startFor(project)
        dev.envpilot.jetbrains.convex.ConvexSyncService.getInstance().ensureStarted()
        watchLinkedProjects(project)
        restoreCommitGuard(project)

        project.messageBus.connect(project).subscribe(
            com.intellij.openapi.application.ApplicationActivationListener.TOPIC,
            object : com.intellij.openapi.application.ApplicationActivationListener {
                override fun applicationActivated(ideFrame: com.intellij.openapi.wm.IdeFrame) {
                    if (project.isDisposed || !dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.autoSync) return
                    SyncScheduler.getInstance().launch {
                        SyncScheduler.getInstance().runCycle(project, skipIfBusy = true)
                    }
                }
            },
        )

        installGlobalGuards()
        installUninstallPurge()
        installKeyHover()

        project.messageBus.connect(project).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileOpened(
                    manager: FileEditorManager,
                    file: com.intellij.openapi.vfs.VirtualFile,
                ) {
                    cloakIfManaged(project, file)
                }

                override fun selectionChanged(event: FileEditorManagerEvent) {
                    event.newFile?.let { cloakIfManaged(project, it) }
                }
            },
        )

        Disposer.register(project) {
            SyncScheduler.getInstance().stopFor(project)
            dev.envpilot.jetbrains.sync.SyncState.clear(project.locationHash)
            unsyncOnClose(project)
        }
    }

    private fun unsyncOnClose(project: Project) {
        if (!dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.autoUnsyncOnClose) return
        val result = dev.envpilot.jetbrains.editor.EnvEditorService.getInstance(project).purgeManagedFiles(respectAutoUnsync = true)
        if (result.removed > 0 || result.preserved > 0) {
            com.intellij.openapi.diagnostic.logger<StartupActivity>()
                .info("Auto-unsync on close: removed ${result.removed}, preserved ${result.preserved} modified/pre-existing file(s)")
        }
    }

    private fun watchLinkedProjects(project: Project) {
        SyncScheduler.getInstance().launch {
            for (link in dev.envpilot.jetbrains.sync.LinkedProjectsService
                .getInstance(project).all()) {
                dev.envpilot.jetbrains.convex.ConvexSyncService.getInstance().watchProject(link.projectId)
            }
        }
    }

    private fun restoreCommitGuard(project: Project) {
        if (!dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.commitGuardEnabled) return
        val managed = dev.envpilot.jetbrains.editor.EnvEditorService.getInstance(project).expectedHashes().keys
        dev.envpilot.jetbrains.sync.LinkedProjectsService.getInstance(project).all()
            .map { it.directoryPath }
            .distinct()
            .forEach { runCatching { dev.envpilot.jetbrains.guards.CommitGuard.install(it, managed) } }
    }

    private fun cloakIfManaged(
        project: Project,
        file: com.intellij.openapi.vfs.VirtualFile,
    ) {
        ApplicationManager.getApplication().invokeLater {
            val editor = FileEditorManager.getInstance(project).selectedTextEditor ?: return@invokeLater
            if (editor.virtualFile?.path == file.path) {
                EnvCloak.refresh(editor, project)
            }
        }
    }

    private fun installUninstallPurge() {
        if (!purgeInstalled.compareAndSet(false, true)) return
        ApplicationManager.getApplication().messageBus.connect(SyncScheduler.getInstance()).subscribe(
            com.intellij.ide.plugins.DynamicPluginListener.TOPIC,
            object : com.intellij.ide.plugins.DynamicPluginListener {
                override fun beforePluginUnload(
                    pluginDescriptor: com.intellij.ide.plugins.IdeaPluginDescriptor,
                    isUpdate: Boolean,
                ) {
                    if (pluginDescriptor.pluginId.idString != dev.envpilot.jetbrains.version.VersionCheck.PLUGIN_ID) return
                    if (!isUpdate) {
                        for (project in com.intellij.openapi.project.ProjectManager.getInstance().openProjects) {
                            dev.envpilot.jetbrains.editor.EnvEditorService.getInstance(project).purgeManagedFiles()
                        }
                    }
                    restoreGlobalGuards()
                    purgeInstalled.set(false)
                    hoverInstalled.set(false)
                }
            },
        )
    }

    private fun installKeyHover() {
        if (!hoverInstalled.compareAndSet(false, true)) return
        EditorFactory.getInstance().eventMulticaster.addEditorMouseMotionListener(
            object : com.intellij.openapi.editor.event.EditorMouseMotionListener {
                override fun mouseMoved(e: com.intellij.openapi.editor.event.EditorMouseEvent) {
                    val editor = e.editor
                    val project = editor.project?.takeIf { !it.isDisposed } ?: return
                    val file = editor.virtualFile ?: return
                    val service = dev.envpilot.jetbrains.editor.EnvEditorService.getInstance(project)
                    if (service.isRevealed()) return
                    if (!dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.hoverEnabled) return
                    if (System.currentTimeMillis() - (editor.getUserData(LAST_HOVER_AT) ?: 0L) < 1500) return
                    val offset = editor.xyToLogicalPosition(e.mouseEvent.point).let { editor.logicalPositionToOffset(it) }
                    val line = editor.document.getLineNumber(offset)
                    val lineStart = editor.document.getLineStartOffset(line)
                    val lineEnd = editor.document.getLineEndOffset(line)
                    val lineText = editor.document.charsSequence.subSequence(lineStart, lineEnd).toString()
                    val column = offset - lineStart
                    val managed = service.managed(file.path)
                    val key =
                        dev.envpilot.jetbrains.editor.resolveManagedKey(
                            lineText,
                            column,
                            file.name.startsWith(".env"),
                            managed?.keys.orEmpty(),
                        ) ?: return
                    val link = dev.envpilot.jetbrains.editor.linkForKey(project, file.path, key) ?: return
                    editor.putUserData(LAST_HOVER_AT, System.currentTimeMillis())
                    com.intellij.codeInsight.hint.HintManager.getInstance().showInformationHint(
                        editor,
                        "$key = ••••••••  Envpilot: ${link.projectName} / ${link.environment}",
                    )
                }
            },
            SyncScheduler.getInstance(),
        )
    }

    private fun installGlobalGuards() {
        if (!guardsInstalled.compareAndSet(false, true)) return
        ApplicationManager.getApplication().invokeLater {
            if (!guardsInstalled.get()) return@invokeLater
            try {
                val manager = EditorActionManager.getInstance()
                val copy = manager.getActionHandler(IdeActions.ACTION_EDITOR_COPY)
                originalCopyHandler.set(copy)
                manager.setActionHandler(IdeActions.ACTION_EDITOR_COPY, CopyGuardHandler(copy, isCut = false))
                val cut = manager.getActionHandler(IdeActions.ACTION_EDITOR_CUT)
                originalCutHandler.set(cut)
                manager.setActionHandler(IdeActions.ACTION_EDITOR_CUT, CopyGuardHandler(cut, isCut = true))
            } catch (e: Exception) {
                dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "copy-guard"))
                com.intellij.openapi.diagnostic.logger<StartupActivity>()
                    .warn("Copy guard registration failed: ${e.message}")
            }
        }
    }

    private fun restoreGlobalGuards() {
        val app = ApplicationManager.getApplication()
        if (!app.isDispatchThread) {
            app.invokeAndWait { restoreGlobalGuards() }
            return
        }
        if (!guardsInstalled.getAndSet(false)) return
        try {
            val manager = EditorActionManager.getInstance()
            originalCopyHandler.getAndSet(null)?.let {
                manager.setActionHandler(IdeActions.ACTION_EDITOR_COPY, it)
            }
            originalCutHandler.getAndSet(null)?.let {
                manager.setActionHandler(IdeActions.ACTION_EDITOR_CUT, it)
            }
        } catch (e: Exception) {
            com.intellij.openapi.diagnostic.logger<StartupActivity>()
                .warn("Copy guard restore failed: ${e.message}")
        }
    }
}
