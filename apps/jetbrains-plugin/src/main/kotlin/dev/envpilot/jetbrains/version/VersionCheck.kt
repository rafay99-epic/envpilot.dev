package dev.envpilot.jetbrains.version

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.diagnostic.logger
import dev.envpilot.jetbrains.auth.AuthService
import dev.envpilot.jetbrains.config.EnvpilotSettings
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * Two-tier version enforcement, port of apps/vscode-extension/src/services/versionCheck.ts:
 *  - below the server `minJetbrains` → hard block (latched on AuthService.outdated)
 *  - behind `jetbrains` (latest) → soft notice (surfaced in settings page)
 *
 * Fail-open: fetch failures never block; a learned min still applies offline.
 *
 * The plugin's own version comes from the build-time BuildConfig, not from
 * PluginManagerCore: the plugin-descriptor lookup APIs became internal
 * (2026.2) with no public replacement that covers older IDEs.
 */
object VersionCheck {
    private val log = logger<VersionCheck>()
    private val gson = Gson()
    private val http: HttpClient =
        HttpClient.newBuilder()
            .version(java.net.http.HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build()

    const val PLUGIN_ID = "dev.envpilot"

    fun currentVersion(): String? = dev.envpilot.jetbrains.BuildConfig.PLUGIN_VERSION.takeIf { it.isNotBlank() }

    @Volatile var latestKnown: String? = null
        private set

    /** <0 if a<b, 0 equal, >0 if a>b. Missing segments count as 0; pre-release ignored. */
    fun compareVersions(
        a: String,
        b: String,
    ): Int {
        fun parse(v: String) = v.split("-")[0].split(".").map { it.toIntOrNull() ?: 0 }
        val pa = parse(a)
        val pb = parse(b)
        for (i in 0..2) {
            val diff = (pa.getOrElse(i) { 0 }) - (pb.getOrElse(i) { 0 })
            if (diff != 0) return if (diff < 0) -1 else 1
        }
        return 0
    }

    /**
     * Fetch the manifest and enforce. Never throws — a failure is logged and
     * leaves any previously learned state intact.
     */
    suspend fun check(currentVersion: String): Boolean {
        try {
            val url = "${EnvpilotSettings.getInstance().effectiveServerUrl()}/api/version"
            val request =
                HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build()
            val response = http.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() == 200) {
                return evaluate(gson.fromJson(response.body(), JsonObject::class.java), currentVersion)
            }
        } catch (e: Exception) {
            log.warn("Version manifest refresh failed: ${e.message}")
            dev.envpilot.jetbrains.errors.Errors.report(e, mapOf("surface" to "version-check"))
        }
        return true
    }

    /** Applies a manifest: records the latest version and (re)sets the outdated latch. */
    internal fun evaluate(
        body: JsonObject?,
        currentVersion: String,
    ): Boolean {
        body?.str("jetbrains")?.let { latestKnown = it }
        val min = body?.str("minJetbrains")
        val supported = min == null || compareVersions(currentVersion, min) >= 0
        // Latch BEFORE anything else so synchronous command dispatch can gate on it.
        AuthService.markOutdated(!supported)
        return supported
    }

    private fun JsonObject.str(key: String): String? = get(key)?.takeIf { it.isJsonPrimitive }?.asString
}
