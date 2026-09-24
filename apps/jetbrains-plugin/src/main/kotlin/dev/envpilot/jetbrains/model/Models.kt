package dev.envpilot.jetbrains.model

data class Org(val id: String, val name: String, val slug: String, val role: String?)

data class Project(
    val id: String,
    val name: String,
    val slug: String,
    val organizationId: String,
    val variableCount: Int,
)

data class PulledVariable(
    val key: String,
    val value: String,
    val environments: List<String>,
    val isSensitive: Boolean,
)

data class PullMeta(
    val decryptionFailures: List<String>?,
    val role: String?,
    val environmentScope: List<String>?,
    val truncatedAt: Int?,
    val autoUnsyncOnClose: Boolean,
    val capabilities: Map<String, Boolean>,
)

data class AccessMeta(
    val environmentScope: List<String>?,
    val capabilities: Map<String, Boolean>,
)

data class PullResult(val variables: List<PulledVariable>, val meta: PullMeta)

data class SecretFileMeta(
    val id: String,
    val name: String,
    val path: String,
    val mode: Int?,
    val size: Long,
)

val VALID_ENVIRONMENTS = listOf("development", "staging", "production")
