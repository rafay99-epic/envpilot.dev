package dev.envpilot.jetbrains.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.popup.JBPopupFactory
import dev.envpilot.jetbrains.auth.AuthService

class SwitchAccountAction : AnAction() {
    override fun update(e: AnActionEvent) {
        val auth = AuthService.getInstance()
        e.presentation.isEnabledAndVisible = auth.accounts().isNotEmpty() && (auth.email == null || auth.accounts().size > 1)
    }

    override fun actionPerformed(e: AnActionEvent) {
        val auth = AuthService.getInstance()
        val accounts = auth.accounts()
        JBPopupFactory.getInstance()
            .createPopupChooserBuilder(accounts.map { it.email })
            .setTitle("Switch Account")
            .setItemChosenCallback { email ->
                accounts.firstOrNull { it.email == email }?.let { auth.switchAccount(it.userId) }
            }
            .createPopup()
            .showInFocusCenter()
    }
}
