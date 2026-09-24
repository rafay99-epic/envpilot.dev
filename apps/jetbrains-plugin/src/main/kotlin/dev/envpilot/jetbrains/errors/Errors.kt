package dev.envpilot.jetbrains.errors

import com.intellij.openapi.diagnostic.logger
import dev.envpilot.jetbrains.BuildConfig
import dev.envpilot.jetbrains.auth.AuthKitLogin
import dev.envpilot.jetbrains.version.VersionCheck
import io.sentry.Sentry
import io.sentry.SentryLevel
import kotlinx.coroutines.TimeoutCancellationException
import java.io.IOException

object Errors {
    const val PLUGIN_DISABLED =
        "Envpilot for JetBrains isn't enabled on your organization's plan. " +
            "Ask an owner to enable it in the Envpilot dashboard."

    const val UPDATE_REQUIRED = "This Envpilot plugin version is no longer supported. Update it from Settings ▸ Plugins."

    private val log = logger<Errors>()

    private val initialized = java.util.concurrent.atomic.AtomicBoolean(false)

    fun init() {
        if (!initialized.compareAndSet(false, true)) return
        if (BuildConfig.SENTRY_DSN.isBlank()) return
        try {
            Sentry.init { options ->
                options.dsn = BuildConfig.SENTRY_DSN
                options.tracesSampleRate = 0.0
                options.isEnableUncaughtExceptionHandler = false
                options.release = "envpilot-jetbrains@${VersionCheck.currentVersion() ?: "unknown"}"
            }
        } catch (_: Exception) {
            initialized.set(false)
        }
    }

    private fun isExpected(e: Throwable): Boolean =
        generateSequence(e) { it.cause }.take(16).any { cause ->
            val msg = cause.message.orEmpty()
            (cause is AuthKitLogin.LoginCancelled && !cause.transient) ||
                cause is IOException ||
                cause is TimeoutCancellationException ||
                msg.startsWith("auth error:") ||
                msg.startsWith("Not signed in") ||
                msg.startsWith("Convex socket stopped") ||
                msg.startsWith("Connection lost") ||
                msg.contains("Unauthenticated") ||
                msg == UPDATE_REQUIRED
        }

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

    fun friendly(e: Throwable): String {
        val raw = e.message ?: e::class.simpleName ?: "unknown error"
        return when {
            raw.contains("Not signed in", true) ->
                "You're signed out. Use Tools ▸ Envpilot ▸ Sign In."
            raw.contains("socket", true) || raw.contains("Connection lost", true) ->
                "Lost the connection to Envpilot. It reconnects on its own; retry in a moment."
            raw.contains("timed out", true) || raw.contains("Timeout", true) ->
                "The server took too long to respond. Check your connection and retry."
            raw.contains("UnknownHost", true) || raw.contains("nodename nor servname", true) ->
                "Can't reach the Envpilot server. Check your internet connection."
            Regex("401|auth error|unauthorized|unauthenticated", RegexOption.IGNORE_CASE).containsMatchIn(raw) ->
                "Your session expired. Sign in again from Tools ▸ Envpilot."
            Regex("403|permission|forbidden|access", RegexOption.IGNORE_CASE).containsMatchIn(raw) ->
                "Your account doesn't have access to this resource."
            raw.contains("Decryption failed", true) ->
                raw
            else -> raw.replaceFirstChar { it.uppercase() }.let { if (it.endsWith(".")) it else "$it." }
        }
    }
}
