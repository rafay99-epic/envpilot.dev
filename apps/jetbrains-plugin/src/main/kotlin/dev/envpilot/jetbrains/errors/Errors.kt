package dev.envpilot.jetbrains.errors

import com.intellij.openapi.diagnostic.logger
import dev.envpilot.jetbrains.BuildConfig
import dev.envpilot.jetbrains.auth.AuthKitLogin
import dev.envpilot.jetbrains.version.VersionCheck
import io.sentry.Sentry
import io.sentry.SentryLevel

/**
 * The one error-handling entry point. Everything that fails reports through
 * [report] (Sentry + idea.log, no-ops without a DSN) and reaches the UI as a
 * friendly sentence via [friendly].
 */
object Errors {
    const val PLUGIN_DISABLED =
        "Envpilot for JetBrains isn't enabled on your organization's plan. " +
            "Ask an owner to enable it in the Envpilot dashboard."

    private val log = logger<Errors>()

    private val initialized = java.util.concurrent.atomic.AtomicBoolean(false)

    fun init() {
        if (!initialized.compareAndSet(false, true)) return
        if (BuildConfig.SENTRY_DSN.isBlank()) return
        try {
            Sentry.init { options ->
                options.dsn = BuildConfig.SENTRY_DSN
                options.tracesSampleRate = 0.0
                options.release = "envpilot-jetbrains@${VersionCheck.currentVersion() ?: "unknown"}"
            }
        } catch (_: Exception) {
            // Telemetry must never break the plugin; leave init untried.
            initialized.set(false)
        }
    }

    /**
     * Conditions the plugin already handles on its own: a sign-in the user
     * cancelled or that timed out (transient ones are network failures and
     * stay reported), a socket auth error (ConvexSyncService refreshes the
     * token and re-authenticates), and a socket that is simply not connected
     * yet. They stay in idea.log; Sentry would only be noise.
     */
    private fun isExpected(e: Throwable): Boolean {
        if (e is AuthKitLogin.LoginCancelled && !e.transient) return true
        val msg = e.message ?: return false
        return msg.startsWith("auth error:") ||
            msg.startsWith("Convex socket not connected") ||
            msg == "socket disconnected"
    }

    /** Report to Sentry + the IDE log. Safe to call from anywhere. */
    fun report(
        e: Throwable,
        context: Map<String, String> = emptyMap(),
    ) {
        log.warn(e)
        if (!initialized.get() || isExpected(e)) return
        try {
            Sentry.withScope { scope ->
                context.forEach { (k, v) -> scope.setTag(k, v) }
                scope.level = SentryLevel.ERROR
                Sentry.captureException(e)
            }
        } catch (_: Exception) {
        }
    }

    /** Human sentence for the UI — what happened and what to do next. */
    fun friendly(e: Throwable): String {
        val raw = e.message ?: e::class.simpleName ?: "unknown error"
        return when {
            raw.contains("Not signed in", true) ->
                "You're signed out — use Tools ▸ Envpilot ▸ Sign In."
            raw.contains("socket", true) || raw.contains("offline", true) ->
                "Real-time sync is offline. We'll keep retrying; sync runs on its interval meanwhile."
            raw.contains("timed out", true) || raw.contains("Timeout", true) ->
                "The server took too long to respond. Check your connection and retry."
            raw.contains("UnknownHost", true) || raw.contains("nodename nor servname", true) ->
                "Can't reach the Envpilot server — check your internet connection."
            Regex("401|auth error|unauthorized", RegexOption.IGNORE_CASE).containsMatchIn(raw) ->
                "Your session expired — sign in again from Tools ▸ Envpilot."
            Regex("403|permission|forbidden|access", RegexOption.IGNORE_CASE).containsMatchIn(raw) ->
                "Your account doesn't have access to this resource."
            raw.contains("Decryption failed", true) ->
                raw // already user-facing from PullService
            else -> raw.replaceFirstChar { it.uppercase() }.let { if (it.endsWith(".")) it else "$it." }
        }
    }
}
