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

data class PullResult(val variables: List<PulledVariable>, val meta: PullMeta)

data class SecretFileMeta(
    val id: String,
    val name: String,
    val path: String,
    /** Octal POSIX mode parsed from the API, e.g. 0o600 → 384. Null when unset. */
    val mode: Int?,
    val size: Long,
)

/**
 * One boolean feature-registry answer. [reason] is only set on a denial, and
 * [tierName] is "unknown" when the server has no active row for the key.
 */
data class FeatureGate(val allowed: Boolean, val reason: String?, val tierName: String)

val VALID_ENVIRONMENTS = listOf("development", "staging", "production")
