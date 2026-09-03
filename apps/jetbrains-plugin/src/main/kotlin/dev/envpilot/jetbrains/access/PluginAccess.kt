package dev.envpilot.jetbrains.access

import dev.envpilot.jetbrains.convex.ConvexApi
import dev.envpilot.jetbrains.model.FeatureGate
import java.util.concurrent.ConcurrentHashMap

/**
 * Tier gate for the JetBrains surface, mirroring the VS Code extension's
 * `extension_access` check. `jetbrains_access` is the feature-registry key an
 * owner flips in the dashboard (or an admin flips in the admin panel); a
 * denial stops linking and syncing for that organization.
 *
 * FAILS OPEN three ways, because none of them is a decision an owner made:
 * a transport error, a link with no organization id, and a server that has no
 * active row for the key (tierName "unknown"). That last one matters — a
 * backend deployed before the seed migration answers `allowed: false` for
 * every organization, and honouring it would strand every user of a plugin
 * that shipped ahead of its backend. Only a real denial closes the gate.
 *
 * Answers are memoized per organization for [TTL_MS], so a sync cycle over
 * several links costs one query per org, and a toggle in the dashboard takes
 * effect within five minutes (or immediately via the tool window's Refresh).
 */
object PluginAccess {
    const val FEATURE_KEY = "jetbrains_access"

    /** Shown on a denial: the server's own reason names the key, not the product. */
    const val DENIED_MESSAGE =
        "The Envpilot JetBrains plugin is not enabled for this organization. " +
            "An owner can turn it on in the Envpilot dashboard, or upgrade the plan."

    private const val TTL_MS = 5 * 60 * 1000L
    private val allowed = FeatureGate(allowed = true, reason = null, tierName = ConvexApi.UNKNOWN_TIER)
    private val cache = ConcurrentHashMap<String, Pair<Long, FeatureGate>>()

    suspend fun check(
        organizationId: String,
        fetch: suspend (String) -> FeatureGate = { ConvexApi.checkFeature(it, FEATURE_KEY) },
    ): FeatureGate {
        if (organizationId.isBlank()) return allowed
        cached(organizationId)?.let { return it }
        val answer = runCatching { fetch(organizationId) }.getOrElse { return allowed }
        val gate = if (answer.tierName == ConvexApi.UNKNOWN_TIER) allowed else answer
        cache[organizationId] = System.currentTimeMillis() to gate
        return gate
    }

    /** Drop every memoized answer so the next check re-reads the registry. */
    fun invalidate() = cache.clear()

    private fun cached(organizationId: String): FeatureGate? {
        val (at, gate) = cache[organizationId] ?: return null
        return gate.takeIf { System.currentTimeMillis() - at < TTL_MS }
    }
}
