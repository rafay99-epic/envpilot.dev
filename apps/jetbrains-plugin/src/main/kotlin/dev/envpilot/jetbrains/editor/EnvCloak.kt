package dev.envpilot.jetbrains.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.FoldRegion
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.editor.ex.util.EditorUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Key
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

object EnvCloak {
    private val FOLDS = Key.create<Array<FoldRegion>>("envpilot.cloakFolds")
    private val FOLD_LISTENER = Key.create<DocumentListener>("envpilot.cloakListener")

    private const val ENV_PLACEHOLDER = "••••••••"
    private const val FILE_PLACEHOLDER = "Envpilot secret file hidden (Reveal Values to show)"

    private val KEY_REGEX = Regex("(?m)^[ \\t]*(?:export[ \\t]+)?([A-Za-z_][A-Za-z0-9_.]*)([ \\t]*=)(.*)$")

    internal fun foldRanges(
        text: CharSequence,
        managedKeys: Set<String>,
    ): List<IntRange> =
        KEY_REGEX.findAll(text)
            .filter { it.groupValues[1] in managedKeys }
            .mapNotNull { it.groups[3]?.range }
            .filterNot { it.isEmpty() }
            .toList()

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
                val folds = mutableListOf<FoldRegion>()
                for (range in foldRanges(text.charsSequence, managed.keys)) {
                    val region = editor.foldingModel.addFoldRegion(range.first, range.last + 1, ENV_PLACEHOLDER)
                    region?.isExpanded = false
                    region?.let { folds.add(it) }
                }
                editor.putUserData(FOLDS, folds.toTypedArray())
            } else if (text.textLength > 0) {
                val region = editor.foldingModel.addFoldRegion(0, text.textLength, FILE_PLACEHOLDER)
                region?.isExpanded = false
                editor.putUserData(FOLDS, if (region != null) arrayOf(region) else emptyArray())
            } else {
                editor.putUserData(FOLDS, emptyArray())
            }
        }

        attachListener(editor, project)
    }

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
        val disposable = Disposer.newDisposable()
        editor.document.addDocumentListener(listener, disposable)
        editor.putUserData(FOLD_LISTENER, listener)
        EditorUtil.disposeWithEditor(editor, disposable)
    }
}
