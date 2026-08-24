package dev.envpilot.jetbrains.editor

import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.icons.AllIcons
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiPlainTextFile
import dev.envpilot.jetbrains.sync.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.swing.Icon

/**
 * Gutter marker at the top of .env* files — the CodeLens analog. Click runs a
 * sync cycle; the tooltip explains the file is Envpilot-managed.
 */
class EnvLineMarkerProvider : LineMarkerProvider {
    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        val file = element.containingFile as? PsiPlainTextFile ?: return null
        if (!file.name.startsWith(".env")) return null
        if (element.textRange.startOffset != 0) return null

        return LineMarkerInfo(
            element,
            element.textRange,
            ICON,
            { "Envpilot-managed env file — click to sync now" },
            { _, psiElement ->
                (psiElement.project as? Project)?.let { project ->
                    CoroutineScope(Dispatchers.IO).launch {
                        SyncScheduler.getInstance().runCycle(project)
                    }
                }
            },
            GutterIconRenderer.Alignment.LEFT,
        )
    }

    private companion object {
        val ICON: Icon = AllIcons.Actions.Refresh
    }
}
