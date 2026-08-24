package dev.envpilot.jetbrains.auth

import com.google.gson.Gson
import com.google.gson.JsonObject
import dev.envpilot.jetbrains.BuildConfig
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * WorkOS AuthKit device authorization flow over raw HTTP (no SDK).
 * Port of apps/vscode-extension/src/services/workos.ts — endpoints, payloads
 * and error mapping are kept identical to the Stage-2 contract.
 */
object WorkosClient {
    private const val WORKOS_BASE = "https://api.workos.com"
    private const val DEVICE_AUTHORIZE_URL = "$WORKOS_BASE/user_management/authorize/device"
    private const val AUTHENTICATE_URL = "$WORKOS_BASE/user_management/authenticate"
    private const val DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

    private val gson = Gson()
    private val http: HttpClient =
        HttpClient.newBuilder()
            .version(java.net.http.HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build()

    class WorkosAuthError(message: String, val code: String) : Exception(message) {
        companion object {
            const val ACCESS_DENIED = "access_denied"
            const val EXPIRED_TOKEN = "expired_token"
            const val NETWORK = "network"
            const val INVALID_RESPONSE = "invalid_response"
            const val NOT_CONFIGURED = "not_configured"
        }
    }

    data class DeviceCodeResponse(
        val deviceCode: String,
        val userCode: String,
        val verificationUri: String,
        val verificationUriComplete: String,
        val expiresIn: Long,
        val interval: Long,
    )

    data class WorkosUser(val id: String, val email: String)

    data class TokenResponse(
        val accessToken: String,
        val refreshToken: String,
        val user: WorkosUser?,
    )

    data class RefreshResponse(val accessToken: String, val refreshToken: String)

    /** Outcome of a SINGLE poll attempt; caller owns the loop. */
    sealed interface PollResult {
        data class Complete(val token: TokenResponse) : PollResult

        data object Pending : PollResult

        data object SlowDown : PollResult

        data object Denied : PollResult

        data object Expired : PollResult

        data object NetworkError : PollResult
    }

    fun requestDeviceCode(): DeviceCodeResponse {
        assertConfigured()
        val result =
            try {
                postForm(DEVICE_AUTHORIZE_URL, mapOf("client_id" to BuildConfig.WORKOS_CLIENT_ID))
            } catch (e: Exception) {
                throw WorkosAuthError("Could not reach WorkOS to start authentication: ${e.message}", WorkosAuthError.NETWORK)
            }
        if (result.first >= 400) {
            val msg = extractErrorMessage(result.second)
            throw WorkosAuthError("WorkOS rejected the device-code request${msg?.let { ": $it" } ?: ""}.", WorkosAuthError.INVALID_RESPONSE)
        }
        return parseDeviceCode(result.second) ?: throw WorkosAuthError(
            "WorkOS returned an unexpected device-code response.",
            WorkosAuthError.INVALID_RESPONSE,
        )
    }

    fun pollForToken(deviceCode: String): PollResult {
        assertConfigured()
        val result =
            try {
                postForm(
                    AUTHENTICATE_URL,
                    mapOf(
                        "client_id" to BuildConfig.WORKOS_CLIENT_ID,
                        "grant_type" to DEVICE_CODE_GRANT,
                        "device_code" to deviceCode,
                    ),
                )
            } catch (_: Exception) {
                return PollResult.NetworkError
            }
        if (result.first == 200) {
            val parsed =
                parseToken(result.second) ?: throw WorkosAuthError(
                    "WorkOS returned an unexpected token response.",
                    WorkosAuthError.INVALID_RESPONSE,
                )
            return PollResult.Complete(parsed)
        }
        return when (extractOauthError(result.second)) {
            "authorization_pending" -> PollResult.Pending
            "slow_down" -> PollResult.SlowDown
            "access_denied" -> PollResult.Denied
            "expired_token" -> PollResult.Expired
            // Unrecognized 4xx/5xx is transient so a hiccup doesn't abort a live flow.
            else -> PollResult.NetworkError
        }
    }

    /** Exchange a refresh token for a fresh access token. May rotate the refresh token. */
    fun refreshAccessToken(refreshToken: String): RefreshResponse {
        assertConfigured()
        val result =
            try {
                postForm(
                    AUTHENTICATE_URL,
                    mapOf(
                        "client_id" to BuildConfig.WORKOS_CLIENT_ID,
                        "grant_type" to "refresh_token",
                        "refresh_token" to refreshToken,
                    ),
                )
            } catch (e: Exception) {
                throw WorkosAuthError("Could not reach WorkOS to refresh the session: ${e.message}", WorkosAuthError.NETWORK)
            }
        if (result.first >= 400) {
            val msg = extractOauthError(result.second) ?: extractErrorMessage(result.second)
            // 5xx / 429 → transient, KEEP creds so the user can retry without re-login.
            // Other 4xx → grant genuinely rejected → access_denied clears the session.
            val transient = result.first >= 500 || result.first == 429
            throw WorkosAuthError(
                "Session refresh failed${msg?.let { ": $it" } ?: ""}.",
                if (transient) WorkosAuthError.NETWORK else WorkosAuthError.ACCESS_DENIED,
            )
        }
        return parseRefresh(result.second) ?: throw WorkosAuthError(
            "WorkOS returned an unexpected refresh response.",
            WorkosAuthError.INVALID_RESPONSE,
        )
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private fun assertConfigured() {
        if (BuildConfig.WORKOS_CLIENT_ID.isBlank()) {
            throw WorkosAuthError(
                "This plugin build has no WorkOS client id embedded. Rebuild with WORKOS_CLIENT_ID set.",
                WorkosAuthError.NOT_CONFIGURED,
            )
        }
    }

    private fun postForm(
        url: String,
        form: Map<String, String>,
    ): Pair<Int, JsonObject?> {
        val body =
            form.entries.joinToString("&") { (k, v) ->
                "${enc(k)}=${enc(v)}"
            }
        val request =
            HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        val json =
            try {
                gson.fromJson(response.body(), JsonObject::class.java)
            } catch (_: Exception) {
                null
            }
        return response.statusCode() to json
    }

    private fun parseDeviceCode(body: JsonObject?): DeviceCodeResponse? {
        if (body == null) return null
        val deviceCode = body.str("device_code") ?: return null
        val userCode = body.str("user_code") ?: return null
        val verificationUri = body.str("verification_uri") ?: return null
        val verificationUriComplete = body.str("verification_uri_complete") ?: return null
        return DeviceCodeResponse(
            deviceCode = deviceCode,
            userCode = userCode,
            verificationUri = verificationUri,
            verificationUriComplete = verificationUriComplete,
            expiresIn = body.get("expires_in")?.takeIf { it.isJsonPrimitive }?.asLong ?: 300L,
            interval = body.get("interval")?.takeIf { it.isJsonPrimitive }?.asLong ?: 5L,
        )
    }

    private fun parseToken(body: JsonObject?): TokenResponse? {
        if (body == null) return null
        val access = body.str("access_token") ?: return null
        val refresh = body.str("refresh_token") ?: return null
        val user =
            body.getAsJsonObject("user")?.let { u ->
                val id = u.str("id")
                val email = u.str("email")
                if (id != null && email != null) WorkosUser(id, email) else null
            }
        return TokenResponse(access, refresh, user)
    }

    private fun parseRefresh(body: JsonObject?): RefreshResponse? {
        if (body == null) return null
        val access = body.str("access_token") ?: return null
        val refresh = body.str("refresh_token") ?: return null
        return RefreshResponse(access, refresh)
    }

    private fun extractOauthError(body: JsonObject?): String? = body?.str("error")

    private fun extractErrorMessage(body: JsonObject?): String? =
        body?.str("error_description") ?: body?.str("message") ?: body?.str("error")

    private fun JsonObject.str(key: String): String? = get(key)?.takeIf { it.isJsonPrimitive }?.asString

    private fun enc(v: String): String = URLEncoder.encode(v, Charsets.UTF_8)
}
