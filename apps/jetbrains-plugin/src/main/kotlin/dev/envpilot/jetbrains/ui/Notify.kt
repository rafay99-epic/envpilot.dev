package dev.envpilot.jetbrains.ui

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project

/** The one balloon helper. Always hops to the EDT — callers are usually coroutines. */
fun notifyBalloon(
    project: Project,
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
