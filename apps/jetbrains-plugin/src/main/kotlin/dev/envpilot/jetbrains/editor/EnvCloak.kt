package dev.envpilot.jetbrains.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.FoldRegion
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Key
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

/**
 * Hides managed secret content at the RENDER level (fold regions), the way
 * the VS Code extension cloaks values — the text is not drawn at all, not
 * merely recolored.
 *
 * - .env files: each managed value folds to "••••••••"
 * - other managed files (uploaded secrets): the whole document folds to a
 *   single "hidden" placeholder
 *
 * Reveal (time-boxed, from the tool window) temporarily removes folds. The
 * copy guard blocks clipboard access to managed files while hidden.
 */
object EnvCloak {
    private val FOLDS = Key.create<Array<FoldRegion>>("envpilot.cloakFolds")
    private val FOLD_LISTENER = Key.create<DocumentListener>("envpilot.cloakListener")

    private const val ENV_PLACEHOLDER = "••••••••"
    private const val FILE_PLACEHOLDER = "🔒 Envpilot secret file — hidden (Reveal Values to show)"

    fun refresh(
        editor: Editor,
        project: Project,
    ) {
        val path = editor.virtualFile?.path ?: return
        val service = EnvEditorService.getInstance(project)
        val managed = service.managed(path)

        clearFolds(editor)
        if (managed == null || !isHidden(project, service)) return

        val isEnvFile = editor.virtualFile.name.startsWith(".env")
        val text = editor.document

        editor.foldingModel.runBatchFoldingOperation {
            if (isEnvFile) {
                val keyRegex = Regex("(?m)^([A-Za-z_][A-Za-z0-9_.]*)(\\s*=)(.*)$")
                val folds = mutableListOf<FoldRegion>()
                for (match in keyRegex.findAll(text.charsSequence)) {
                    val key = match.groupValues[1]
                    if (key !in managed.keys) continue
                    val range = match.groups[3]!!.range
                    if (range.isEmpty()) continue
                    val region = editor.foldingModel.addFoldRegion(range.first, range.last + 1, ENV_PLACEHOLDER)
                    region?.isExpanded = false
                    region?.let { folds.add(it) }
                }
                editor.putUserData(FOLDS, folds.toTypedArray())
            } else if (text.textLength > 2) {
                // Whole-document fold for uploaded secret files (json, pem, keystore…).
                val region = editor.foldingModel.addFoldRegion(1, text.textLength, FILE_PLACEHOLDER)
                region?.isExpanded = false
                editor.putUserData(FOLDS, if (region != null) arrayOf(region) else emptyArray())
            } else {
                editor.putUserData(FOLDS, emptyArray())
            }
        }

        attachListener(editor, project)
    }

    /** Managed and currently hidden? The copy guard blocks clipboard access then. */
    fun isProtected(
        editor: Editor,
        project: Project,
    ): Boolean {
        val path = editor.virtualFile?.path ?: return false
        val service = EnvEditorService.getInstance(project)
        return service.managed(path) != null && isHidden(project, service)
    }

    private fun isHidden(
        project: Project,
        service: EnvEditorService,
    ): Boolean {
        if (service.isRevealed()) return false
        if (dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.cloakValues) return true
        val projectIds = dev.envpilot.jetbrains.sync.LinkedProjectsService.getInstance(project).all().map { it.projectId }.distinct()
        return !service.canReveal(projectIds)
    }

    fun hashOf(path: Path): String =
        MessageDigest.getInstance("SHA-256")
            .digest(Files.readAllBytes(path))
            .joinToString("") { "%02x".format(it) }

    private fun clearFolds(editor: Editor) {
        editor.getUserData(FOLDS)?.forEach {
            if (it.isValid) editor.foldingModel.removeFoldRegion(it)
        }
        editor.putUserData(FOLDS, null)
    }

    private fun attachListener(
        editor: Editor,
        project: Project,
    ) {
        if (editor.getUserData(FOLD_LISTENER) != null) return
        val listener =
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) {
                    ApplicationManager.getApplication().invokeLater {
                        if (!editor.isDisposed) refresh(editor, project)
                    }
                }
            }
        editor.document.addDocumentListener(listener)
        editor.putUserData(FOLD_LISTENER, listener)
        Disposer.register(project) {
            editor.document.removeDocumentListener(listener)
        }
    }
}
