package dev.envpilot.jetbrains.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages
import dev.envpilot.jetbrains.auth.AuthService

class SwitchAccountAction : AnAction() {
    override fun update(e: AnActionEvent) {
        val auth = AuthService.getInstance()
        e.presentation.isEnabledAndVisible = auth.accounts().isNotEmpty() && (auth.email == null || auth.accounts().size > 1)
    }

    override fun actionPerformed(e: AnActionEvent) {
        val auth = AuthService.getInstance()
        val accounts = auth.accounts()
        val labels = accounts.map { it.email }.toTypedArray()
        val selected = Messages.showChooseDialog("Choose an Envpilot account", "Switch Account", labels, labels.first(), null)
        accounts.getOrNull(selected)?.let { auth.switchAccount(it.userId) }
    }
}
