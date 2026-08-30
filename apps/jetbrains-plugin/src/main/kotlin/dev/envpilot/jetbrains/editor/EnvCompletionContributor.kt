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
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import kotlinx.coroutines.runBlocking

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
            var anyUncached = false
            for (link in links) {
                service.cachedKeys(link.projectId)?.let { cached.addAll(it) } ?: run { anyUncached = true }
            }
            if (!anyUncached) return cached.ifEmpty { null }

            // Fetch missing metadata on the current thread (completion is already
            // async); failures degrade to cached keys only.
            return try {
                runBlocking {
                    if (AuthService.getInstance().getSession() == null) return@runBlocking cached.ifEmpty { null }
                    for (link in links) {
                        if (service.cachedKeys(link.projectId) != null) continue
                        val meta =
                            ConvexApi.pullValues(
                                link.projectId,
                                link.environment.takeIf { it.isNotBlank() },
                                metadataOnly = true,
                            )
                        val keys = meta.variables.map { it.key }.toSet()
                        service.cacheKeys(link.projectId, keys)
                        cached.addAll(keys)
                    }
                    cached.ifEmpty { null }
                }
            } catch (e: Exception) {
                dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "completion"))
                cached.ifEmpty { null }
            }
        }
    }
}
