package dev.envpilot.jetbrains.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import dev.envpilot.jetbrains.auth.AuthService

class SignOutAllAction : AnAction() {
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = AuthService.getInstance().accounts().isNotEmpty()
    }

    override fun actionPerformed(e: AnActionEvent) {
        AuthService.getInstance().signOutAll()
    }
}
