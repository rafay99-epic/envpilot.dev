package dev.envpilot.jetbrains.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import dev.envpilot.jetbrains.auth.AuthService

class SignInAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val service = AuthService.getInstance()
        service.startSignIn { email, error ->
            ApplicationManager.getApplication().invokeLater {
                when {
                    error != null ->
                        com.intellij.notification.NotificationGroupManager.getInstance()
                            .getNotificationGroup("dev.envpilot.notifications")
                            .createNotification(
                                "Envpilot sign-in failed: ${error.message}",
                                com.intellij.notification.NotificationType.ERROR,
                            )
                            .notify(e.project)
                    email != null ->
                        com.intellij.notification.NotificationGroupManager.getInstance()
                            .getNotificationGroup("dev.envpilot.notifications")
                            .createNotification("Signed in to Envpilot as $email", com.intellij.notification.NotificationType.INFORMATION)
                            .notify(e.project)
                }
            }
        }
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = !AuthService.outdated
        e.presentation.text = if (AuthService.getInstance().email == null) "Sign In to Envpilot" else "Add Envpilot Account"
    }
}
