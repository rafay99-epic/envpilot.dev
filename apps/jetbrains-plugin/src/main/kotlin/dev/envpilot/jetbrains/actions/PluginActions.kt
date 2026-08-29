package dev.envpilot.jetbrains.actions

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAwareAction
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.editor.EnvEditorService
import dev.envpilot.jetbrains.editor.EnvKeyReferences
import dev.envpilot.jetbrains.guards.CommitGuard
import dev.envpilot.jetbrains.sync.LinkedProject
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import dev.envpilot.jetbrains.sync.SyncScheduler
import dev.envpilot.jetbrains.sync.SyncState
import dev.envpilot.jetbrains.ui.refreshOpenEnvEditors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.nio.file.Path

private val actionScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

class PullNowAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        actionScope.launch {
            val ok = SyncScheduler.getInstance().runCycle(project)
            notify(
                project,
                if (ok) "Pull complete." else "Pull failed: ${SyncState.lastError ?: "unknown error"}",
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
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val links = LinkedProjectsService.getInstance(project).all()
        val state =
            if (dev.envpilot.jetbrains.auth.AuthService.getInstance().email == null) {
                "Signed out"
            } else if (SyncState.lastError == null) {
                "Connected"
            } else {
                "Last pull failed: ${SyncState.lastError}"
            }
        notify(project, "Envpilot: $state. ${links.size} environment link(s).", NotificationType.INFORMATION)
    }
}

class ToggleCloakingAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val settings = EnvpilotSettings.getInstance().state
        if (!settings.cloakValues) {
            settings.cloakValues = true
            refreshOpenEnvEditors(project)
            notify(project, "Secret values cloaked.", NotificationType.INFORMATION)
            return
        }
        actionScope.launch {
            if (!refreshRevealAccess(project)) {
                notify(project, "Your role does not allow unmasking secret values.", NotificationType.WARNING)
                return@launch
            }
            settings.cloakValues = false
            refreshOpenEnvEditors(project)
            notify(project, "Secret values visible until cloaking is enabled again.", NotificationType.INFORMATION)
        }
    }
}

class RevealValuesAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        actionScope.launch {
            if (!refreshRevealAccess(project)) {
                notify(project, "Your role does not allow revealing secret values.", NotificationType.WARNING)
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
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val match = valueAtCaret(project)
        if (match == null) {
            notify(project, "Place the caret on an Envpilot-managed env key.", NotificationType.WARNING)
            return
        }
        actionScope.launch {
            try {
                val editor = EnvEditorService.getInstance(project)
                val metadata = ConvexApi.accessMeta(match.link.projectId)
                editor.cacheAccessMeta(match.link.projectId, metadata)
                if (!editor.hasCapability(match.link.projectId, "project.secrets.reveal")) {
                    notify(project, "Your role does not allow revealing secret values.", NotificationType.WARNING)
                    return@launch
                }
                val result = ConvexApi.pullValues(match.link.projectId, match.link.environment, metadataOnly = false)
                result.meta.truncatedAt?.let { error("Variable result was truncated at $it") }
                if (match.key in result.meta.decryptionFailures.orEmpty()) error("${match.key} could not be decrypted")
                val variable =
                    result.variables.firstOrNull { it.key == match.key }
                        ?: error("${match.key} was not found in ${match.link.environment}")
                notify(project, "${match.key} = ${variable.value}", NotificationType.INFORMATION)
            } catch (error: Exception) {
                dev.envpilot.jetbrains.errors.Errors.report(error, mapOf("surface" to "reveal-at-caret"))
                notify(project, dev.envpilot.jetbrains.errors.Errors.friendly(error), NotificationType.ERROR)
            }
        }
    }
}

class InstallCommitGuardAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val roots = linkedRoots(project)
        val installed = roots.count { CommitGuard.install(it) }
        EnvpilotSettings.getInstance().state.commitGuardEnabled = installed > 0
        notify(
            project,
            if (installed > 0) "Commit guard installed in $installed Git repository root(s)." else "No linked Git repository found.",
            if (installed > 0) NotificationType.INFORMATION else NotificationType.WARNING,
        )
    }
}

class RemoveCommitGuardAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val roots = linkedRoots(project)
        val removed = roots.count { CommitGuard.remove(it) }
        EnvpilotSettings.getInstance().state.commitGuardEnabled = false
        notify(project, "Commit guard removed from $removed Git repository root(s).", NotificationType.INFORMATION)
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
    val managed = EnvEditorService.getInstance(project)
    val envKey = text.trimStart().substringBefore('=').trim().takeIf { file.name.startsWith(".env") }
    val key =
        envKey?.takeIf { it in managed.managed(file.path)?.keys.orEmpty() }
            ?: EnvKeyReferences.at(text, offset - start)?.key
            ?: return null
    val link =
        LinkedProjectsService.getInstance(project).all().firstOrNull {
            runCatching { Path.of(file.path).startsWith(Path.of(it.directoryPath)) }.getOrDefault(false) &&
                key in managed.managed(Path.of(it.directoryPath, dev.envpilot.jetbrains.sync.targetFileFor(it)).toString())?.keys.orEmpty()
        } ?: return null
    return CaretValue(key, link)
}

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

private fun notify(
    project: com.intellij.openapi.project.Project,
    message: String,
    type: NotificationType,
) {
    ApplicationManager.getApplication().invokeLater {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("dev.envpilot.notifications")
            .createNotification(message, type)
            .notify(project)
    }
}
