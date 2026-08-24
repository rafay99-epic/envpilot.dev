package dev.envpilot.jetbrains.telemetry

import dev.envpilot.jetbrains.BuildConfig
import dev.envpilot.jetbrains.version.VersionCheck
import io.sentry.Sentry
import io.sentry.SentryLevel

/**
 * Sentry wrapper. No-ops entirely when no DSN was baked at build time
 * (local dev builds), so telemetry never becomes a failure source.
 */
object EnvSentry {

    @Volatile private var initialized = false

    fun init() {
        if (initialized || BuildConfig.SENTRY_DSN.isBlank()) return
        try {
            Sentry.init { options ->
                options.dsn = BuildConfig.SENTRY_DSN
                options.tracesSampleRate = 0.0
                options.release = "envpilot-jetbrains@${VersionCheck.currentVersion() ?: "unknown"}"
            }
            initialized = true
        } catch (_: Exception) {
            // Telemetry must never break the plugin.
        }
    }

    fun capture(e: Throwable, context: Map<String, String> = emptyMap()) {
        if (!initialized) return
        try {
            Sentry.withScope { scope ->
                context.forEach { (k, v) -> scope.setTag(k, v) }
                scope.level = SentryLevel.ERROR
                Sentry.captureException(e)
            }
        } catch (_: Exception) {
        }
    }
}
