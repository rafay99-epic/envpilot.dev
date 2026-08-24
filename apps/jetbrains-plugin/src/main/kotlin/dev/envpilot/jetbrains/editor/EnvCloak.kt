package dev.envpilot.jetbrains.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.editor.markup.EffectType
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.project.Project
import com.intellij.openapi.editor.colors.EditorColorsManager
import java.awt.Font
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

/**
 * Cloaks managed variable values inside open editors by painting their text
 * with the editor background color (text stays selectable for legitimate
 * copies — the copy guard decides that separately). Ranges recompute on every
 * document change; reveal is time-boxed.
 */
object EnvCloak {

    private val CLOAK_RANGES = Key.create<List<IntRange>>("envpilot.cloakRanges")
    private val CLOAK_LISTENER = Key.create<DocumentListener>("envpilot.cloakListener")

    fun refresh(editor: Editor, project: Project) {
        val path = editor.virtualFile?.path ?: return
        val service = EnvEditorService.getInstance(project)
        val managed = service.managed(path)

        editor.markupModel.allHighlighters
            .filter { it.getUserData(OUR_MARKER) == true }
            .forEach { editor.markupModel.removeHighlighter(it) }

        editor.putUserData(CLOAK_RANGES, emptyList())
        if (managed == null || service.isRevealed()) return

        val bg = EditorColorsManager.getInstance().globalScheme.defaultBackground
        val attrs = TextAttributes().apply {
            foregroundColor = bg
            effectColor = bg
            effectType = EffectType.BOXED
            fontType = Font.PLAIN
        }

        val ranges = mutableListOf<IntRange>()
        val text = editor.document.text
        val keyRegex = Regex("(?m)^([A-Za-z_][A-Za-z0-9_.]*)(\\s*=)(.*)$")
        for (match in keyRegex.findAll(text)) {
            val key = match.groupValues[1]
            if (key !in managed.keys) continue
            val valueRange = match.groups[3]!!.range
            if (valueRange.isEmpty()) continue
            ranges.add(valueRange)
            editor.markupModel.addRangeHighlighter(
                valueRange.first, valueRange.last + 1,
                HighlighterLayer.CARET_ROW + 1,
                attrs,
                com.intellij.openapi.editor.markup.HighlighterTargetArea.EXACT_RANGE
            ).putUserData(OUR_MARKER, true)
        }
        editor.putUserData(CLOAK_RANGES, ranges)

        attachListener(editor, project)
    }

    /** Selection intersects a cloaked value range? Used by the copy guard. */
    fun selectionIntersectsCloak(editor: Editor, project: Project): Boolean {
        val ranges = editor.getUserData(CLOAK_RANGES) ?: return false
        if (ranges.isEmpty()) return false
        val sel = editor.selectionModel
        if (!sel.hasSelection()) return false
        val start = sel.selectionStart
        val end = sel.selectionEnd
        return ranges.any { it.first < end && it.last + 1 > start }
    }

    fun hashOf(path: Path): String =
        MessageDigest.getInstance("SHA-256")
            .digest(Files.readAllBytes(path))
            .joinToString("") { "%02x".format(it) }

    private fun attachListener(editor: Editor, project: Project) {
        if (editor.getUserData(CLOAK_LISTENER) != null) return
        val listener = object : DocumentListener {
            override fun documentChanged(event: DocumentEvent) {
                ApplicationManager.getApplication().invokeLater {
                    if (!editor.isDisposed) refresh(editor, project)
                }
            }
        }
        editor.document.addDocumentListener(listener)
        editor.putUserData(CLOAK_LISTENER, listener)
        Disposer.register(project) {
            editor.document.removeDocumentListener(listener)
        }
    }

    private val OUR_MARKER = Key.create<Boolean>("envpilot.cloakMarker")
}
