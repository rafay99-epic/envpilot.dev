package dev.envpilot.jetbrains.editor

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionProvider
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.project.Project
import com.intellij.patterns.PlatformPatterns
import com.intellij.patterns.StandardPatterns
import com.intellij.psi.PsiPlainTextFile
import com.intellij.util.ProcessingContext
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.sync.LinkedProject
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import dev.envpilot.jetbrains.sync.SyncScheduler
import java.util.concurrent.ConcurrentHashMap

/**
 * Env-key autocomplete inside .env* files. Keys come from linked projects'
 * metadata (no decryption), cached 30s. Port of the extension's autocomplete
 * provider, scoped to plain-text env files.
 */
class EnvCompletionContributor : CompletionContributor() {
    init {
        extend(
            CompletionType.BASIC,
            PlatformPatterns.psiElement().inFile(
                PlatformPatterns.psiFile(PsiPlainTextFile::class.java).withName(
                    StandardPatterns.string().startsWith(".env"),
                ),
            ),
            Provider,
        )
    }

    private object Provider : CompletionProvider<CompletionParameters>() {
        private val warming = ConcurrentHashMap.newKeySet<String>()

        override fun addCompletions(
            parameters: CompletionParameters,
            context: ProcessingContext,
            result: CompletionResultSet,
        ) {
            val project = parameters.editor.project ?: return
            val keys = fetchKeys(project) ?: return
            for (key in keys) {
                result.addElement(
                    LookupElementBuilder.create(key)
                        .withTypeText("Envpilot")
                        .withTailText("  (Envpilot-managed)", true),
                )
            }
        }

        private fun fetchKeys(project: Project): Set<String>? {
            if (!dev.envpilot.jetbrains.config.EnvpilotSettings.getInstance().state.autocompleteEnabled) return null
            val service = EnvEditorService.getInstance(project)
            val links = LinkedProjectsService.getInstance(project).all()
            if (links.isEmpty()) return null

            val cached = mutableSetOf<String>()
            val missing = mutableListOf<LinkedProject>()
            for (link in links) {
                // A known-disabled org offers nothing, cached or not.
                if (SyncScheduler.getInstance().cachedAccess(link.orgId) == false) continue
                service.cachedKeys(link.projectId)?.let { cached.addAll(it) } ?: missing.add(link)
            }
            // Never block completion on the network — warm the cache off-thread
            // so the NEXT invocation has the keys. PullService warms it too.
            if (missing.isNotEmpty()) warmCache(project, missing)
            return cached.ifEmpty { null }
        }

        private fun warmCache(
            project: Project,
            links: List<LinkedProject>,
        ) {
            // Caches are per IDE project, so the single-flight key must be too.
            val keyOf = { link: LinkedProject -> "${project.locationHash}:${link.projectId}" }
            val pending = links.filter { warming.add(keyOf(it)) }
            if (pending.isEmpty()) return
            SyncScheduler.getInstance().launch {
                try {
                    if (project.isDisposed || AuthService.getInstance().getSession() == null) return@launch
                    val service = EnvEditorService.getInstance(project)
                    for (link in pending) {
                        try {
                            if (!SyncScheduler.getInstance().hasAccess(link.orgId)) continue
                            val meta =
                                ConvexApi.pullValues(
                                    link.projectId,
                                    link.environment.takeIf { it.isNotBlank() },
                                    metadataOnly = true,
                                )
                            service.cacheKeys(link.projectId, meta.variables.map { it.key }.toSet())
                        } catch (e: Exception) {
                            dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "completion"))
                        }
                    }
                } finally {
                    pending.forEach { warming.remove(keyOf(it)) }
                }
            }
        }
    }
}
