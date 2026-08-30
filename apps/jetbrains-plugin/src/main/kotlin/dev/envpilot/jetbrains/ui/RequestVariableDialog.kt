package dev.envpilot.jetbrains.ui

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.Disposer
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.panel
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.model.VALID_ENVIRONMENTS
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.swing.JComponent

data class RequestProject(
    val id: String,
    val name: String,
    val allowedEnvironments: List<String>,
)

/**
 * Submit a variable request (same approval flow as the web). The value is
 * encrypted server-side by the createWithValue action.
 */
class RequestVariableDialog(
    private val project: Project,
    private val projects: List<RequestProject>,
) : DialogWrapper(project) {
    private val keyField = javax.swing.JTextField()
    private val valueField = javax.swing.JPasswordField()
    private val descriptionField = javax.swing.JTextField()
    private val envChecks = VALID_ENVIRONMENTS.map { it to javax.swing.JCheckBox(it.capitalize()) }
    private val sensitiveCheck = javax.swing.JCheckBox("Sensitive value", true)
    private val projectCombo =
        javax.swing.JComboBox(projects.map { it.name }.toTypedArray())

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        title = "Request Variable"
        setOKButtonText("Submit Request")
        envChecks.first().second.isSelected = true
        projectCombo.addActionListener { updateEnvironmentAccess() }
        updateEnvironmentAccess()
        Disposer.register(myDisposable) { scope.cancel() }
        init()
    }

    override fun createCenterPanel(): JComponent =
        panel {
            group("Variable") {
                row("Project:") {
                    cell(projectCombo).align(AlignX.FILL)
                }
                row("Key:") {
                    cell(keyField).align(AlignX.FILL)
                }.comment("UPPER_SNAKE_CASE — letters, digits and underscores, starting with a letter.")
                row("Proposed value:") {
                    cell(valueField).align(AlignX.FILL)
                }.comment("Sent over TLS and encrypted by the existing Convex action before storage.")
                row("Description:") {
                    cell(descriptionField).align(AlignX.FILL)
                }.comment("Optional context for whoever approves this request.")
            }
            group("Environments") {
                row {
                    envChecks.forEach { (_, check) -> cell(check) }
                }
            }
            group("Options") {
                row { cell(sensitiveCheck) }
            }
        }

    override fun doValidate(): ValidationInfo? {
        if (!Regex("^[A-Z][A-Z0-9_]*$").matches(keyField.text.trim())) {
            return ValidationInfo("Key must be UPPER_SNAKE_CASE (A-Z, 0-9, _)", keyField)
        }
        if (keyField.text.trim().length > 100) {
            return ValidationInfo("Key must be 100 characters or less", keyField)
        }
        if (valueField.password.isEmpty()) {
            return ValidationInfo("Value is required", valueField)
        }
        if (envChecks.none { it.second.isSelected }) {
            return ValidationInfo("Pick at least one environment", envChecks[0].second)
        }
        return null
    }

    override fun doOKAction() {
        val selectedProject = projects.getOrNull(projectCombo.selectedIndex) ?: return
        val projectId = selectedProject.id
        val key = keyField.text.trim()
        val value = String(valueField.password)
        val description = descriptionField.text.trim().takeIf { it.isNotEmpty() }
        val environments = envChecks.filter { it.second.isSelected }.map { it.first }
        val sensitive = sensitiveCheck.isSelected

        val confirmed =
            com.intellij.openapi.ui.Messages.showYesNoDialog(
                project,
                "Submit $key for ${selectedProject.name}?\n\n" +
                    "Environments: ${environments.joinToString(", ")}\n" +
                    "Sensitive: ${if (sensitive) "Yes" else "No"}",
                "Submit Variable Request",
                "Submit Request",
                "Cancel",
                com.intellij.icons.AllIcons.General.QuestionDialog,
            )
        if (confirmed != com.intellij.openapi.ui.Messages.YES) return

        scope.launch {
            try {
                check(AuthService.getInstance().getSession() != null) { "Not signed in" }
                ConvexApi.createVariableRequest(projectId, key, value, environments, sensitive, description)
                notify("Variable request for $key submitted — awaiting approval.", NotificationType.INFORMATION)
            } catch (e: Exception) {
                dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "request-variable"))
                notify("Request failed: ${dev.envpilot.jetbrains.errors.Errors.friendly(e)}", NotificationType.ERROR)
            }
        }
        super.doOKAction()
    }

    private fun updateEnvironmentAccess() {
        val allowed = projects.getOrNull(projectCombo.selectedIndex)?.allowedEnvironments.orEmpty()
        envChecks.forEach { (environment, check) ->
            check.isEnabled = environment in allowed
            if (!check.isEnabled) check.isSelected = false
        }
        if (envChecks.none { it.second.isSelected }) {
            envChecks.firstOrNull { it.second.isEnabled }?.second?.isSelected = true
        }
    }

    private fun notify(
        message: String,
        type: NotificationType,
    ) {
        javax.swing.SwingUtilities.invokeLater {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("dev.envpilot.notifications")
                .createNotification(message, type)
                .notify(project)
        }
    }
}

private fun String.capitalize(): String = replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
