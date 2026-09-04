package dev.envpilot.jetbrains.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import dev.envpilot.jetbrains.auth.AuthService

class SignOutAllAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = AuthService.getInstance().accounts().isNotEmpty()
    }

    override fun actionPerformed(e: AnActionEvent) {
        AuthService.getInstance().signOutAll()
    }
}
