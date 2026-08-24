package dev.envpilot.jetbrains.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import dev.envpilot.jetbrains.auth.AuthService

class SignOutAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        AuthService.getInstance().signOut()
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = AuthService.getInstance().email != null
    }
}
