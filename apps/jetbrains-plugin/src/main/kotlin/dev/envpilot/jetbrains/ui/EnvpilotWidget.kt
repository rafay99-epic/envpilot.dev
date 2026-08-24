package dev.envpilot.jetbrains.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.auth.AuthStateListener
import dev.envpilot.jetbrains.sync.SyncState
import dev.envpilot.jetbrains.sync.SyncStateListener
import java.awt.Component
import java.awt.event.MouseEvent

class EnvpilotWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = EnvpilotWidget.ID

    override fun getDisplayName(): String = "Envpilot"

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget = EnvpilotWidget()

    override fun disposeWidget(widget: StatusBarWidget) = Disposer.dispose(widget)

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}

class EnvpilotWidget : StatusBarWidget, StatusBarWidget.TextPresentation {
    companion object {
        const val ID = "dev.envpilot.widget"
    }

    private var statusBar: StatusBar? = null

    override fun ID(): String = ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        Disposer.register(this) {
            this.statusBar?.removeWidget(ID)
            this.statusBar = null
        }
        ApplicationManager.getApplication().messageBus.connect(this)
            .subscribe(
                AuthService.AUTH_TOPIC,
                object : AuthStateListener {
                    override fun authChanged() {
                        ApplicationManager.getApplication().invokeLater {
                            this@EnvpilotWidget.statusBar?.updateWidget(ID)
                        }
                    }
                },
            )
        ApplicationManager.getApplication().messageBus.connect(this)
            .subscribe(
                SyncState.SYNC_TOPIC,
                object : SyncStateListener {
                    override fun syncStateChanged() {
                        ApplicationManager.getApplication().invokeLater {
                            this@EnvpilotWidget.statusBar?.updateWidget(ID)
                        }
                    }
                },
            )
        ApplicationManager.getApplication().executeOnPooledThread {
            AuthService.getInstance() // triggers service init + state load
            ApplicationManager.getApplication().invokeLater {
                statusBar.updateWidget(ID)
            }
        }
    }

    override fun getText(): String {
        val email = AuthService.getInstance().email ?: return "Envpilot: Sign In"
        if (AuthService.outdated) return "Envpilot: Update Required"
        if (SyncState.syncing) return "Envpilot: ⟳ Syncing…"
        val err = SyncState.lastError
        if (err != null) return "Envpilot: Sync Error"
        return "Envpilot: $email"
    }

    override fun getAlignment(): Float = Component.CENTER_ALIGNMENT

    override fun getTooltipText(): String =
        when {
            AuthService.outdated ->
                "Envpilot: update required — your plugin version no longer works with the server."
            else ->
                buildString {
                    append("Envpilot — click for sign-in options")
                    SyncState.lastError?.let { append("\nLast sync error: $it") }
                }
        }

    override fun getClickConsumer(): Consumer<MouseEvent> =
        Consumer { event ->
            val email = AuthService.getInstance().email
            val group = DefaultActionGroup()
            if (email == null) {
                group.add(action("dev.envpilot.SignIn") ?: return@Consumer)
            } else {
                group.addSeparator("Signed in as $email")
                group.add(action("dev.envpilot.SignOut") ?: return@Consumer)
            }
            JBPopupFactory.getInstance()
                .createActionGroupPopup(
                    "Envpilot",
                    group,
                    com.intellij.openapi.actionSystem.DataContext.EMPTY_CONTEXT,
                    JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
                    false,
                )
                .show(
                    com.intellij.ui.awt.RelativePoint(
                        event.component,
                        java.awt.Point(0, event.component.height),
                    ),
                )
        }

    private fun action(actionId: String): AnAction? = ActionManager.getInstance().getAction(actionId)
}
