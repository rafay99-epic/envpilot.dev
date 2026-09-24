package dev.envpilot.jetbrains.actions

import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAwareAction
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.editor.linkForKey
import dev.envpilot.jetbrains.editor.resolveManagedKey
import dev.envpilot.jetbrains.errors.Errors
import dev.envpilot.jetbrains.guards.CommitGuard
import dev.envpilot.jetbrains.sync.LinkedProject
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import dev.envpilot.jetbrains.sync.SyncScheduler
import dev.envpilot.jetbrains.sync.SyncState
import dev.envpilot.jetbrains.ui.notifyBalloon
import dev.envpilot.jetbrains.ui.refreshOpenEnvEditors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.StringSelection

class PullNowAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        SyncScheduler.getInstance().launch {
            val ok = SyncScheduler.getInstance().runCycle(project)
            notifyBalloon(
                project,
                if (ok) "Pull complete." else "Pull failed: ${SyncState.lastError(project.locationHash) ?: "unknown error"}",
                if (ok) NotificationType.INFORMATION else NotificationType.ERROR,
            )
            refreshOpenEnvEditors(project)
        }
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project?.let { LinkedProjectsService.getInstance(it).all().isNotEmpty() } == true
    }
}

class ShowStatusAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val links = LinkedProjectsService.getInstance(project).all()
        val state =
            if (dev.envpilot.jetbrains.auth.AuthService.getInstance().email == null) {
                "Signed out"
            } else if (SyncState.lastError(project.locationHash) == null) {
                "Connected"
            } else {
                "Last pull failed: ${SyncState.lastError(project.locationHash)}"
            }
        notifyBalloon(project, "Envpilot: $state. ${links.size} environment link(s).", NotificationType.INFORMATION)
    }
}

class OpenDashboardAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun actionPerformed(e: AnActionEvent) {
        com.intellij.ide.BrowserUtil.browse(EnvpilotSettings.getInstance().effectiveServerUrl())
    }
}

class ToggleCloakingAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val project = e.project
        e.presentation.isEnabled =
            project != null && (!EnvpilotSettings.getInstance().state.cloakValues || canReveal(project))
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val settings = EnvpilotSettings.getInstance().state
        if (!settings.cloakValues) {
            settings.cloakValues = true
            refreshOpenEnvEditors(project)
            notifyBalloon(project, "Secret values cloaked.", NotificationType.INFORMATION)
            return
        }
        SyncScheduler.getInstance().launch {
            if (!hasPluginAccess(project)) {
                notifyBalloon(project, Errors.PLUGIN_DISABLED, NotificationType.WARNING)
                return@launch
            }
            if (!refreshRevealAccess(project)) {
                notifyBalloon(project, "Your role does not allow unmasking secret values.", NotificationType.WARNING)
                return@launch
            }
            settings.cloakValues = false
            refreshOpenEnvEditors(project)
            notifyBalloon(project, "Secret values visible until cloaking is enabled again.", NotificationType.INFORMATION)
        }
    }
}

class RevealValuesAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project?.let(::canReveal) == true
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        SyncScheduler.getInstance().launch {
            if (!hasPluginAccess(project)) {
                notifyBalloon(project, Errors.PLUGIN_DISABLED, NotificationType.WARNING)
                return@launch
            }
            if (!refreshRevealAccess(project)) {
                notifyBalloon(project, "Your role does not allow revealing secret values.", NotificationType.WARNING)
                return@launch
            }
            EnvEditorService.getInstance(project).revealFor(30)
            refreshOpenEnvEditors(project)
            delay(30_000)
            refreshOpenEnvEditors(project)
        }
    }
}

class RevealValueAtCaretAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project?.let(::canReveal) == true
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val match = valueAtCaret(project)
        if (match == null) {
            notifyBalloon(project, "Place the caret on an Envpilot-managed env key.", NotificationType.WARNING)
            return
        }
        SyncScheduler.getInstance().launch {
            try {
                if (!SyncScheduler.getInstance().hasAccess(match.link.orgId)) {
                    notifyBalloon(project, Errors.PLUGIN_DISABLED, NotificationType.WARNING)
                    return@launch
                }
                val editor = EnvEditorService.getInstance(project)
                val metadata = ConvexApi.accessMeta(match.link.projectId)
                editor.cacheAccessMeta(match.link.projectId, metadata)
                if (!editor.hasCapability(match.link.projectId, "project.secrets.reveal")) {
                    notifyBalloon(project, "Your role does not allow revealing secret values.", NotificationType.WARNING)
                    return@launch
                }
                val result = ConvexApi.pullValues(match.link.projectId, match.link.environment, metadataOnly = false)
                result.meta.truncatedAt?.let { error("Variable result was truncated at $it") }
                if (match.key in result.meta.decryptionFailures.orEmpty()) error("${match.key} could not be decrypted")
                val variable =
                    result.variables.firstOrNull { it.key == match.key }
                        ?: error("${match.key} was not found in ${match.link.environment}")
                CopyPasteManager.getInstance().setContents(StringSelection(variable.value))
                notifyBalloon(project, "${match.key} copied to clipboard.", NotificationType.INFORMATION)
                try {
                    delay(30_000)
                } finally {
                    clearClipboardIfHolding(variable.value)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Errors.report(error, mapOf("surface" to "reveal-at-caret"))
                notifyBalloon(project, Errors.friendly(error), NotificationType.ERROR)
            }
        }
    }
}

class InstallCommitGuardAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project?.let { linkedRoots(it).isNotEmpty() } == true
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        SyncScheduler.getInstance().launch {
            val managed = EnvEditorService.getInstance(project).expectedHashes().keys
            val installed = linkedRoots(project).count { runCatching { CommitGuard.install(it, managed) }.getOrDefault(false) }
            EnvpilotSettings.getInstance().state.commitGuardEnabled = installed > 0
            notifyBalloon(
                project,
                if (installed > 0) "Commit guard installed in $installed Git repository root(s)." else GUARD_SKIPPED,
                if (installed > 0) NotificationType.INFORMATION else NotificationType.WARNING,
            )
        }
    }
}

class RemoveCommitGuardAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project?.let { linkedRoots(it).isNotEmpty() } == true
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        SyncScheduler.getInstance().launch {
            val removed = linkedRoots(project).count { runCatching { CommitGuard.remove(it) }.getOrDefault(false) }
            EnvpilotSettings.getInstance().state.commitGuardEnabled = false
            notifyBalloon(project, "Commit guard removed from $removed Git repository root(s).", NotificationType.INFORMATION)
        }
    }
}

private data class CaretValue(val key: String, val link: LinkedProject)

private fun valueAtCaret(project: com.intellij.openapi.project.Project): CaretValue? {
    val editor = FileEditorManager.getInstance(project).selectedTextEditor ?: return null
    val file = editor.virtualFile ?: return null
    val offset = editor.caretModel.offset
    val line = editor.document.getLineNumber(offset)
    val start = editor.document.getLineStartOffset(line)
    val end = editor.document.getLineEndOffset(line)
    val text = editor.document.charsSequence.subSequence(start, end).toString()
    val key =
        resolveManagedKey(
            text,
            offset - start,
            file.name.startsWith(".env"),
            EnvEditorService.getInstance(project).managed(file.path)?.keys.orEmpty(),
        ) ?: return null
    return linkForKey(project, file.path, key)?.let { CaretValue(key, it) }
}

const val GUARD_SKIPPED =
    "Commit guard skipped: no Git repository found, or the repository manages its own hooks (core.hooksPath, for example husky)."

private fun canReveal(project: com.intellij.openapi.project.Project): Boolean =
    EnvEditorService.getInstance(project).canReveal(
        LinkedProjectsService.getInstance(project).all().map { it.projectId }.distinct(),
    )

private fun linkedRoots(project: com.intellij.openapi.project.Project): Set<String> =
    LinkedProjectsService.getInstance(project).all().map { it.directoryPath }.toSet()

private suspend fun refreshRevealAccess(project: com.intellij.openapi.project.Project): Boolean {
    val links = LinkedProjectsService.getInstance(project).all().distinctBy { it.projectId }
    if (links.isEmpty()) return false
    val editor = EnvEditorService.getInstance(project)
    for (link in links) {
        val metadata = ConvexApi.accessMeta(link.projectId)
        editor.cacheAccessMeta(link.projectId, metadata)
    }
    return editor.canReveal(links.map { it.projectId })
}

private suspend fun hasPluginAccess(project: com.intellij.openapi.project.Project): Boolean =
    LinkedProjectsService.getInstance(project).all()
        .map { it.orgId }
        .distinct()
        .all { SyncScheduler.getInstance().hasAccess(it) }

private fun clearClipboardIfHolding(value: String) {
    val manager = CopyPasteManager.getInstance()
    val current =
        runCatching { manager.contents?.getTransferData(DataFlavor.stringFlavor) as? String }
            .getOrNull()
    if (current == value) manager.setContents(StringSelection(""))
}
