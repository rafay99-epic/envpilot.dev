package dev.envpilot.jetbrains.editor

import com.intellij.openapi.project.Project
import dev.envpilot.jetbrains.sync.LinkedProject
import dev.envpilot.jetbrains.sync.LinkedProjectsService
import dev.envpilot.jetbrains.sync.targetFileFor
import java.nio.file.Path

fun resolveManagedKey(
    lineText: String,
    column: Int,
    isEnvFile: Boolean,
    managedKeys: Set<String>,
): String? {
    if (isEnvFile) return envKeyOf(lineText)?.takeIf { it in managedKeys }
    return EnvKeyReferences.at(lineText, column)?.key
}

private fun envKeyOf(lineText: String): String? {
    val trimmed = lineText.trimStart()
    if (trimmed.isEmpty() || trimmed.startsWith("#") || '=' !in trimmed) return null
    return trimmed.substringBefore('=')
        .trim()
        .removePrefix("export ")
        .trim()
        .takeIf { it.isNotEmpty() }
}

fun linkForKey(
    project: Project,
    filePath: String,
    key: String,
): LinkedProject? {
    val service = EnvEditorService.getInstance(project)
    return LinkedProjectsService.getInstance(project).all().firstOrNull {
        runCatching { Path.of(filePath).startsWith(Path.of(it.directoryPath)) }.getOrDefault(false) &&
            key in service.managed(Path.of(it.directoryPath, targetFileFor(it)).toString())?.keys.orEmpty()
    }
}
