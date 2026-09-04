package dev.envpilot.jetbrains.editor

/**
 * The Envpilot-managed key the caret sits on. In a .env file the whole line
 * resolves to its `KEY=` (column-independent, matching the folding model);
 * anywhere else only a code reference (`process.env.X`, `os.getenv("X")`, …)
 * counts. Shared by the reveal-at-caret action and the hover hint.
 */
fun resolveManagedKey(
    lineText: String,
    column: Int,
    isEnvFile: Boolean,
    managedKeys: Set<String>,
): String? {
    val envKey = if (isEnvFile) envKeyOf(lineText) else null
    return envKey?.takeIf { it in managedKeys }
        ?: EnvKeyReferences.at(lineText, column)?.key
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
