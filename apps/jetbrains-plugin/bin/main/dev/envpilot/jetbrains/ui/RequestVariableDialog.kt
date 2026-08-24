package dev.envpilot.jetbrains.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.panel
import dev.envpilot.jetbrains.api.EnvpilotApi
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.model.VALID_ENVIRONMENTS
import dev.envpilot.jetbrains.telemetry.EnvSentry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.swing.JComponent

/**
 * Submit a variable request (same approval flow as the web). The value is
 * encrypted server-side by the createWithValue action.
 */
class RequestVariableDialog(
    private val project: Project,
    private val projects: List<Pair<String, String>>, // id to name
) : DialogWrapper(project) {

    private val keyField = javax.swing.JTextField()
    private val valueField = javax.swing.JTextField()
    private val descriptionField = javax.swing.JTextField()
    private val envChecks = VALID_ENVIRONMENTS.map { it to javax.swing.JCheckBox(it.capitalize()) }
    private val sensitiveCheck = javax.swing.JCheckBox("Sensitive value", true)
    private val projectCombo =
        javax.swing.JComboBox(projects.map { it.second }.toTypedArray())

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        title = "Request Variable"
        setOKButtonText("Submit Request")
        envChecks.first().second.isSelected = true
        init()
    }

    override fun createCenterPanel(): JComponent = panel {
        group("Variable") {
            row("Project:") {
                cell(projectCombo).align(AlignX.FILL)
            }
            row("Key:") {
                cell(keyField).align(AlignX.FILL)
            }.comment("UPPER_SNAKE_CASE — letters, digits and underscores, starting with a letter.")
            row("Proposed value:") {
                cell(valueField).align(AlignX.FILL)
            }.comment("Encrypted server-side before storage; never leaves the machine in plaintext.")
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
        if (valueField.text.isBlank()) {
            return ValidationInfo("Value is required", valueField)
        }
        if (envChecks.none { it.second.isSelected }) {
            return ValidationInfo("Pick at least one environment", envChecks[0].second)
        }
        return null
    }

    override fun doOKAction() {
        val projectId = projects.getOrNull(projectCombo.selectedIndex)?.first ?: return
        val key = keyField.text.trim()
        val value = valueField.text
        val description = descriptionField.text.trim().takeIf { it.isNotEmpty() }
        val environments = envChecks.filter { it.second.isSelected }.map { it.first }
        val sensitive = sensitiveCheck.isSelected

        scope.launch {
            try {
                val auth = AuthService.getInstance()
                val api = EnvpilotApi(EnvpilotSettings.getInstance().effectiveServerUrl()) { force ->
                    auth.getFreshToken(force)
                }
                api.createVariableRequest(projectId, key, value, environments, sensitive, description)
                notify("Variable request for $key submitted — awaiting approval.", NotificationType.INFORMATION)
            } catch (e: Exception) {
                EnvSentry.capture(e, mapOf("surface" to "request-variable"))
                notify("Request failed: ${e.message ?: e::class.simpleName}", NotificationType.ERROR)
            }
        }
        super.doOKAction()
    }

    private fun notify(message: String, type: NotificationType) {
        javax.swing.SwingUtilities.invokeLater {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("dev.envpilot.notifications")
                .createNotification(message, type)
                .notify(project)
        }
    }
}

private fun String.capitalize(): String =
    replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
