package dev.envpilot.jetbrains.guards

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import com.intellij.openapi.project.Project
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import dev.envpilot.jetbrains.editor.EnvCloak

/**
 * Blocks clipboard copies whose selection intersects a cloaked value range.
 * Registered programmatically over the original handler (see StartupActivity)
 * to avoid editorActionHandler EP recursion.
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
        if (project != null && EnvCloak.selectionIntersectsCloak(editor, project)) {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("dev.envpilot.notifications")
                .createNotification(
                    if (isCut) "Cut blocked: selection contains an Envpilot-managed secret value."
                    else "Copy blocked: selection contains an Envpilot-managed secret value.",
                    NotificationType.WARNING
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
