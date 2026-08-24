package dev.envpilot.jetbrains

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.actionSystem.IdeActions
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.util.Disposer
import dev.envpilot.jetbrains.editor.EnvCloak
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.guards.CopyGuardHandler
import dev.envpilot.jetbrains.sync.SyncScheduler
import dev.envpilot.jetbrains.telemetry.EnvSentry
import dev.envpilot.jetbrains.version.VersionCheck
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Per project open: initialize auth + telemetry, run the version check, start
 * auto-sync, register the copy guard and cloak-on-open listeners. Everything
 * is cancelled/disposed when the project closes.
 */
class StartupActivity : ProjectActivity {

    companion object {
        private val guardsInstalled = AtomicBoolean(false)
    }

    override suspend fun execute(project: Project) {
        EnvSentry.init()
        AuthService.getInstance().initialize()

        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            VersionCheck.currentVersion()?.let { current ->
                VersionCheck.check(current)
            }
        }

        SyncScheduler.getInstance().startFor(project)

        installGlobalGuards()

        // Cloak managed values when a file opens or becomes active.
        project.messageBus.connect().subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileOpened(manager: FileEditorManager, file: com.intellij.openapi.vfs.VirtualFile) {
                    cloakIfManaged(project, file)
                }

                override fun selectionChanged(event: FileEditorManagerEvent) {
                    event.newFile?.let { cloakIfManaged(project, it) }
                }
            }
        )

        Disposer.register(project) {
            SyncScheduler.getInstance().stopFor(project)
        }
    }

    private fun cloakIfManaged(project: Project, file: com.intellij.openapi.vfs.VirtualFile) {
        if (!file.name.startsWith(".env")) return
        ApplicationManager.getApplication().invokeLater {
            val editor = FileEditorManager.getInstance(project).selectedTextEditor ?: return@invokeLater
            if (editor.virtualFile?.path == file.path) {
                EnvCloak.refresh(editor, project)
            }
        }
    }

    /** App-wide, once: wrap copy/cut with the cloak-aware guard. */
    private fun installGlobalGuards() {
        if (!guardsInstalled.compareAndSet(false, true)) return
        ApplicationManager.getApplication().invokeLater {
            try {
                val actionManager = com.intellij.openapi.actionSystem.ActionManager.getInstance()
                val copyAction = actionManager.getAction(IdeActions.ACTION_COPY)
                        as com.intellij.openapi.editor.actionSystem.EditorAction
                copyAction.setupHandler(CopyGuardHandler(copyAction.handler, isCut = false))
                val cutAction = actionManager.getAction(IdeActions.ACTION_CUT)
                        as com.intellij.openapi.editor.actionSystem.EditorAction
                cutAction.setupHandler(CopyGuardHandler(cutAction.handler, isCut = true))
            } catch (e: Exception) {
                dev.envpilot.jetbrains.telemetry.EnvSentry.capture(e, mapOf("surface" to "copy-guard"))
                com.intellij.openapi.diagnostic.logger<StartupActivity>()
                    .warn("Copy guard registration failed: ${e.message}")
            }
        }
    }
}
