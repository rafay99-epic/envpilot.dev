package dev.envpilot.jetbrains.guards

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.editor.EnvCloak

/**
 * Blocks clipboard copies/cuts from any Envpilot-managed file while it is
 * hidden. Reveal Values (time-boxed) lifts the block.
 */
class CopyGuardHandler(
    private val delegate: EditorActionHandler,
    private val isCut: Boolean = false,
) : EditorActionHandler() {
    override fun doExecute(
        editor: Editor,
        caret: Caret?,
        dataContext: DataContext?,
    ) {
        val project: Project? = editor.project
        if (project != null && EnvCloak.isProtected(editor, project)) {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("dev.envpilot.notifications")
                .createNotification(
                    if (isCut) {
                        "Cut blocked: this file is Envpilot-managed and hidden."
                    } else {
                        "Copy blocked: this file is Envpilot-managed and hidden. Use Reveal Values first."
                    },
                    NotificationType.WARNING,
                )
                .notify(project)
            return
        }
        delegate.execute(editor, caret, dataContext)
    }

    override fun isEnabledForCaret(
        editor: Editor,
        caret: Caret,
        dataContext: DataContext?,
    ): Boolean = delegate.isEnabled(editor, caret, dataContext)
}
