package dev.envpilot.jetbrains.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import dev.envpilot.jetbrains.api.EnvpilotApi
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import dev.envpilot.jetbrains.model.VALID_ENVIRONMENTS
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import dev.envpilot.jetbrains.telemetry.EnvSentry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JCheckBox
import javax.swing.JTextField
import javax.swing.JTextArea
import javax.swing.JLabel
import java.awt.GridLayout

/**
 * Submit a variable request (goes through the same approval flow as the web).
 * The value is encrypted server-side by the createWithValue action — it never
 * travels anywhere unencrypted.
 */
class RequestVariableDialog(
    private val project: Project,
    private val projects: List<Pair<String, String>>, // id to name
) : DialogWrapper(project) {

    private val keyField = JTextField()
    private val valueField = JTextField()
    private val descriptionField = JTextField()
    private val envChecks = VALID_ENVIRONMENTS.map { it to JCheckBox(it) }
    private val sensitiveCheck = JCheckBox("Sensitive value", true)
    private val projectCombo = javax.swing.JComboBox(projects.map { it.second }.toTypedArray())

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        title = "Request Variable"
        init()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel(java.awt.BorderLayout(0, 8))
        val grid = JPanel(GridLayout(0, 1))
        grid.add(JLabel("Project:"))
        grid.add(projectCombo)
        grid.add(JLabel("Key (UPPER_SNAKE_CASE):"))
        grid.add(keyField)
        grid.add(JLabel("Proposed value:"))
        grid.add(valueField)
        grid.add(JLabel("Description:"))
        grid.add(descriptionField)
        val envRow = JPanel()
        envChecks.forEach { envRow.add(it.second) }
        grid.add(JLabel("Environments:"))
        grid.add(envRow)
        grid.add(sensitiveCheck)
        panel.add(grid, java.awt.BorderLayout.NORTH)
        return panel
    }

    override fun doValidate(): com.intellij.openapi.ui.ValidationInfo? {
        if (!Regex("^[A-Z][A-Z0-9_]*$").matches(keyField.text.trim())) {
            return com.intellij.openapi.ui.ValidationInfo(
                "Key must be UPPER_SNAKE_CASE (A-Z, 0-9, _)",
                keyField
            )
        }
        if (valueField.text.isBlank()) {
            return com.intellij.openapi.ui.ValidationInfo("Value is required", valueField)
        }
        if (envChecks.none { it.second.isSelected }) {
            return com.intellij.openapi.ui.ValidationInfo("Pick at least one environment", envChecks[0].second)
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
