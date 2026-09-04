package dev.envpilot.jetbrains

import com.intellij.openapi.actionSystem.IdeActions
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.actionSystem.EditorAction
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
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

/**
 * Per project open: initialize auth + error reporting, run the version check, start
 * auto-sync, register the copy guard and cloak-on-open listeners. Project work is
 * disposed when the project closes; the app-wide hooks live and die with the plugin.
 */
class StartupActivity : ProjectActivity {
    companion object {
        private val guardsInstalled = AtomicBoolean(false)
        private val purgeInstalled = AtomicBoolean(false)
        private val hoverInstalled = AtomicBoolean(false)
        private val originalCopyHandler = AtomicReference<EditorActionHandler?>(null)
        private val originalCutHandler = AtomicReference<EditorActionHandler?>(null)
        private val LAST_HOVER_AT = Key.create<Long>("envpilot.lastHoverAt")

        // App service: disposed on plugin unload, so it is our plugin-lifetime parent.
        private fun pluginLifetime(): SyncScheduler = SyncScheduler.getInstance()
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

        // Perceived real-time: pull the moment the user returns to the IDE.
        project.messageBus.connect(project).subscribe(
            com.intellij.openapi.application.ApplicationActivationListener.TOPIC,
            object : com.intellij.openapi.application.ApplicationActivationListener {
                override fun applicationActivated(ideFrame: com.intellij.openapi.wm.IdeFrame) {
                    if (project.isDisposed) return
                    SyncScheduler.getInstance().launch {
                        SyncScheduler.getInstance().runCycle(project)
                    }
                }
            },
        )

        installGlobalGuards()
        installUninstallPurge()
        installKeyHover()

        // Cloak managed values when a file opens or becomes active.
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
            unsyncOnClose(project)
        }
    }

    /**
     * Decrypted secrets on disk defeat the vault — when the IDE closes,
     * delete the env files and secret files we materialized. Only files we
     * wrote (tracked in EnvEditorService) are ever touched.
     */
    private fun unsyncOnClose(project: Project) {
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
        dev.envpilot.jetbrains.sync.LinkedProjectsService.getInstance(project).all()
            .map { it.directoryPath }
            .distinct()
            .forEach(dev.envpilot.jetbrains.guards.CommitGuard::install)
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

    /**
     * App-wide, once: when the plugin is disabled/uninstalled, delete every
     * pulled env file and secret file — same protection as close-time unsync.
     */
    private fun installUninstallPurge() {
        if (!purgeInstalled.compareAndSet(false, true)) return
        ApplicationManager.getApplication().messageBus.connect(pluginLifetime()).subscribe(
            com.intellij.ide.plugins.DynamicPluginListener.TOPIC,
            object : com.intellij.ide.plugins.DynamicPluginListener {
                override fun beforePluginUnload(
                    pluginDescriptor: com.intellij.ide.plugins.IdeaPluginDescriptor,
                    isUpdate: Boolean,
                ) {
                    if (pluginDescriptor.pluginId.idString != dev.envpilot.jetbrains.version.VersionCheck.PLUGIN_ID) return
                    for (project in com.intellij.openapi.project.ProjectManager.getInstance().openProjects) {
                        dev.envpilot.jetbrains.editor.EnvEditorService.getInstance(project).purgeManagedFiles()
                    }
                    restoreGlobalGuards()
                    purgeInstalled.set(false)
                    hoverInstalled.set(false)
                }
            },
        )
    }

    /** App-wide, once: show masked Envpilot metadata when hovering managed env keys or code references. */
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
                    val link =
                        dev.envpilot.jetbrains.sync.LinkedProjectsService.getInstance(project).all().firstOrNull {
                            val targetName =
                                dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.targetFile.ifBlank { ".env.local" }
                            val keys = service.managed(java.nio.file.Path.of(it.directoryPath, targetName).toString())?.keys.orEmpty()
                            runCatching { java.nio.file.Path.of(file.path).startsWith(java.nio.file.Path.of(it.directoryPath)) }
                                .getOrDefault(false) && key in keys
                        } ?: return
                    editor.putUserData(LAST_HOVER_AT, System.currentTimeMillis())
                    com.intellij.codeInsight.hint.HintManager.getInstance().showInformationHint(
                        editor,
                        "$key = ••••••••  Envpilot: ${link.projectName} / ${link.environment}",
                    )
                }
            },
            pluginLifetime(),
        )
    }

    /** App-wide, once: wrap copy/cut with the cloak-aware guard. */
    private fun installGlobalGuards() {
        if (!guardsInstalled.compareAndSet(false, true)) return
        ApplicationManager.getApplication().invokeLater {
            try {
                val actionManager = com.intellij.openapi.actionSystem.ActionManager.getInstance()
                val copyAction = actionManager.getAction(IdeActions.ACTION_COPY) as EditorAction
                originalCopyHandler.set(copyAction.handler)
                copyAction.setupHandler(CopyGuardHandler(copyAction.handler, isCut = false))
                val cutAction = actionManager.getAction(IdeActions.ACTION_CUT) as EditorAction
                originalCutHandler.set(cutAction.handler)
                cutAction.setupHandler(CopyGuardHandler(cutAction.handler, isCut = true))
            } catch (e: Exception) {
                dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "copy-guard"))
                com.intellij.openapi.diagnostic.logger<StartupActivity>()
                    .warn("Copy guard registration failed: ${e.message}")
            }
        }
    }

    /** Undo [installGlobalGuards] so a dynamic reload reinstalls onto the real handlers. */
    private fun restoreGlobalGuards() {
        if (!guardsInstalled.getAndSet(false)) return
        try {
            val actionManager = com.intellij.openapi.actionSystem.ActionManager.getInstance()
            originalCopyHandler.getAndSet(null)?.let {
                (actionManager.getAction(IdeActions.ACTION_COPY) as EditorAction).setupHandler(it)
            }
            originalCutHandler.getAndSet(null)?.let {
                (actionManager.getAction(IdeActions.ACTION_CUT) as EditorAction).setupHandler(it)
            }
        } catch (e: Exception) {
            com.intellij.openapi.diagnostic.logger<StartupActivity>()
                .warn("Copy guard restore failed: ${e.message}")
        }
    }
}
