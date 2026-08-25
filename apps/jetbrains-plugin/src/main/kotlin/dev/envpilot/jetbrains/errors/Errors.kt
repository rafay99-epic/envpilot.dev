package dev.envpilot.jetbrains.errors

import com.intellij.openapi.diagnostic.logger
import dev.envpilot.jetbrains.BuildConfig
import dev.envpilot.jetbrains.version.VersionCheck
import io.sentry.Sentry
import io.sentry.SentryLevel

/**
 * The one error-handling entry point. Everything that fails reports through
 * [report] (Sentry + idea.log, no-ops without a DSN) and reaches the UI as a
 * friendly sentence via [friendly]. Known failure modes are thrown as
 * [EnvpilotException]; unexpected ones are wrapped by [run].
 */
object Errors {
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

    /** Report to Sentry + the IDE log. Safe to call from anywhere. */
    fun report(
        e: Throwable,
        context: Map<String, String> = emptyMap(),
    ) {
        log.warn(e)
        if (!initialized.get()) return
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
        if (e is EnvpilotException) return e.message ?: "Something went wrong."
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
            raw.contains("Port", true) && raw.contains("busy", true) ->
                raw
            else -> raw.replaceFirstChar { it.uppercase() }.let { if (it.endsWith(".")) it else "$it." }
        }
    }

    /** Run [block], reporting and wrapping unexpected failures for the UI. */
    inline fun <T> run(
        context: Map<String, String> = emptyMap(),
        block: () -> T,
    ): T =
        try {
            block()
        } catch (e: EnvpilotException) {
            report(e, context)
            throw e
        } catch (e: Exception) {
            report(e, context)
            throw EnvpilotException(
                title = friendly(e),
                retryable = true,
                cause = e,
            )
        }
}

/**
 * Known failure modes with UI-ready wording. Throw these where the failure is
 * understood; unexpected failures get wrapped by [Errors.run].
 */
class EnvpilotException(
    val title: String,
    val hint: String = "",
    val retryable: Boolean = true,
    cause: Throwable? = null,
) : Exception(if (hint.isBlank()) title else "$title $hint", cause)
