package dev.envpilot.jetbrains.editor

import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.icons.AllIcons
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiPlainTextFile
import dev.envpilot.jetbrains.sync.SyncScheduler
import javax.swing.Icon

class EnvLineMarkerProvider : LineMarkerProvider {
    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        val file = element.containingFile as? PsiPlainTextFile ?: return null
        if (element.textRange.startOffset != 0) return null
        val path = file.virtualFile?.path ?: return null
        if (EnvEditorService.getInstance(file.project).managed(path) == null) return null

        return LineMarkerInfo(
            element,
            element.textRange,
            ICON,
            { "Envpilot-managed file. Click to sync now." },
            { _, psiElement ->
                SyncScheduler.getInstance().launch { SyncScheduler.getInstance().runCycle(psiElement.project) }
            },
            GutterIconRenderer.Alignment.LEFT,
        ) { "Envpilot-managed file" }
    }

    private companion object {
        val ICON: Icon = AllIcons.Actions.Refresh
    }
}
