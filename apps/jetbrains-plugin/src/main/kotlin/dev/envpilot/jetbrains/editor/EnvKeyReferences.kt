package dev.envpilot.jetbrains.editor

object EnvKeyReferences {
    data class Match(val key: String, val start: Int, val end: Int)

    private val patterns =
        listOf(
            Regex("(?:process\\.env\\.|process\\.env\\[[\\\"'`])([A-Za-z_][A-Za-z0-9_]*)"),
            Regex("(?:os\\.(?:getenv|environ\\.get)\\([\\\"']|os\\.environ\\[[\\\"'])([A-Za-z_][A-Za-z0-9_]*)"),
            Regex("(?:ENV\\[[\\\"']|getenv\\([\\\"']|os\\.Getenv\\([\\\"'])([A-Za-z_][A-Za-z0-9_]*)"),
            Regex(
                "(?:System\\.getenv|dotenv\\.get|Environment\\.GetEnvironmentVariable|" +
                    "std::env::(?:var|var_os))\\([\\\"']([A-Za-z_][A-Za-z0-9_]*)",
            ),
        )

    fun at(
        line: String,
        column: Int,
    ): Match? =
        patterns.asSequence()
            .flatMap { it.findAll(line) }
            .mapNotNull { result ->
                val group = result.groups[1] ?: return@mapNotNull null
                Match(group.value, group.range.first, group.range.last + 1)
            }
            .firstOrNull { column in it.start..it.end }
}
