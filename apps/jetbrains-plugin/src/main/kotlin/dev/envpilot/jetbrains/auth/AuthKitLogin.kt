package dev.envpilot.jetbrains.auth

import com.intellij.ide.BrowserUtil
import dev.envpilot.jetbrains.BuildConfig
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

/**
 * WorkOS AuthKit device authorization flow — the same login the VS Code
 * extension and CLI use: request a device code, open the hosted approval
 * page in the browser, poll the token endpoint until approved. No redirect
 * URI, no loopback server, no port to collide with other IDE instances.
 *
 * Token exchange and refresh are standard WorkOS endpoints. `refresh` keeps
 * its own retry treatment (transient failures keep credentials, rejected
 * grants clear them — see AuthService).
 */
object AuthKitLogin {
    private const val DEVICE_AUTHORIZE_URL = "https://api.workos.com/user_management/authorize/device"
    private const val AUTHENTICATE_URL = "https://api.workos.com/user_management/authenticate"
    private const val DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

    class LoginCancelled(message: String, val transient: Boolean = false) : Exception(message)

    private val http: HttpClient =
        HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build()

    /**
     * Run the device flow. Blocks the calling (IO) coroutine until the user
     * approves, the code expires, or the approval is denied in the browser.
     */
    fun signIn(): TokenResponse {
        val device = requestDeviceCode()
        BrowserUtil.browse(device.verificationUriComplete)
        val deadline = System.currentTimeMillis() + device.expiresIn * 1000L
        var intervalSeconds = device.interval
        while (System.currentTimeMillis() < deadline) {
            Thread.sleep(intervalSeconds * 1000L)
            when (val poll = pollForToken(device.deviceCode)) {
                is PollResult.Complete -> return poll.token
                PollResult.Pending -> Unit
                PollResult.Network -> Unit
                PollResult.SlowDown -> intervalSeconds += 5
                PollResult.Denied -> throw LoginCancelled("Sign-in was denied in the browser.")
                PollResult.Expired -> throw LoginCancelled("The sign-in code expired — start again.")
            }
        }
        throw LoginCancelled("Sign-in timed out — no browser approval.")
    }

    /** Standard WorkOS refresh grant (rotates the refresh token). */
    fun refresh(refreshToken: String): TokenResponse {
        val body =
            postAuthenticate(
                mapOf(
                    "grant_type" to "refresh_token",
                    "client_id" to BuildConfig.WORKOS_CLIENT_ID,
                    "refresh_token" to refreshToken,
                ),
            )
        return parseToken(body)
    }

    // ── Device flow ──────────────────────────────────────────────────────────

    private class DeviceCode(
        val deviceCode: String,
        val userCode: String,
        val verificationUri: String,
        val verificationUriComplete: String,
        val expiresIn: Int,
        val interval: Int,
    )

    private sealed interface PollResult {
        data class Complete(val token: TokenResponse) : PollResult

        data object Pending : PollResult

        data object SlowDown : PollResult

        data object Denied : PollResult

        data object Expired : PollResult

        data object Network : PollResult
    }

    private fun requestDeviceCode(): DeviceCode {
        val response =
            try {
                post(DEVICE_AUTHORIZE_URL, mapOf("client_id" to BuildConfig.WORKOS_CLIENT_ID))
            } catch (e: java.io.IOException) {
                throw LoginCancelled("Could not reach WorkOS to start authentication.", transient = true)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                throw LoginCancelled("Sign-in was interrupted.", transient = true)
            }
        if (response.statusCode() >= 400) {
            val message = errorMessage(response.body())
            throw LoginCancelled(
                message?.let { "WorkOS rejected the device-code request: $it" }
                    ?: "WorkOS rejected the device-code request.",
                transient = response.statusCode() >= 500,
            )
        }
        val obj =
            try {
                com.google.gson.JsonParser.parseString(response.body()).asJsonObject
            } catch (_: Exception) {
                throw LoginCancelled("WorkOS returned an unexpected device-code response.")
            }
        val values =
            listOf(
                str(obj, "device_code"),
                str(obj, "user_code"),
                str(obj, "verification_uri"),
                str(obj, "verification_uri_complete"),
            ).map { value ->
                value?.takeIf { it.isNotBlank() }
                    ?: throw LoginCancelled("WorkOS returned an unexpected device-code response.")
            }
        return DeviceCode(
            deviceCode = values[0],
            userCode = values[1],
            verificationUri = values[2],
            verificationUriComplete = values[3],
            expiresIn = obj.get("expires_in")?.takeIf { it.isJsonPrimitive }?.asInt ?: 300,
            interval = obj.get("interval")?.takeIf { it.isJsonPrimitive }?.asInt ?: 5,
        )
    }

    /**
     * One poll attempt. 200 issues tokens; the documented OAuth errors map to
     * their own outcome; anything else is treated as transient so a hiccup
     * doesn't abort an otherwise-live flow.
     */
    private fun pollForToken(deviceCode: String): PollResult {
        val response =
            try {
                post(
                    AUTHENTICATE_URL,
                    mapOf(
                        "client_id" to BuildConfig.WORKOS_CLIENT_ID,
                        "grant_type" to DEVICE_CODE_GRANT,
                        "device_code" to deviceCode,
                    ),
                )
            } catch (e: Exception) {
                return PollResult.Network
            }
        if (response.statusCode() < 400) {
            val body = gson().fromJson(response.body(), JsonObjectResponse::class.java)
            return PollResult.Complete(parseToken(body ?: throw LoginCancelled("Empty response from WorkOS")))
        }
        return when (oauthError(response.body())) {
            "authorization_pending" -> PollResult.Pending
            "slow_down" -> PollResult.SlowDown
            "access_denied" -> PollResult.Denied
            "expired_token" -> PollResult.Expired
            else -> PollResult.Network
        }
    }

    // ── Transport (token refresh path) ───────────────────────────────────────

    private fun postAuthenticate(form: Map<String, String>): JsonObjectResponse {
        val request =
            HttpRequest.newBuilder()
                .uri(URI.create(AUTHENTICATE_URL))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form.entries.joinToString("&") { "${enc(it.key)}=${enc(it.value)}" }))
                .build()
        repeat(3) { attempt ->
            val response =
                try {
                    http.send(request, HttpResponse.BodyHandlers.ofString())
                } catch (e: java.io.IOException) {
                    if (attempt < 2) {
                        Thread.sleep(250L shl attempt)
                        return@repeat
                    }
                    throw LoginCancelled("WorkOS is temporarily unreachable.", transient = true)
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                    throw LoginCancelled("Sign-in was interrupted.", transient = true)
                }
            if (response.statusCode() < 400) {
                return gson().fromJson(response.body(), JsonObjectResponse::class.java)
                    ?: throw LoginCancelled("Empty response from WorkOS")
            }
            val message =
                runCatching {
                    gson().fromJson(response.body(), JsonObjectResponse::class.java)
                }.getOrNull()
            val transient = isTransientFailure(response.statusCode(), message?.error)
            if (transient && attempt < 2) {
                Thread.sleep(250L shl attempt)
                return@repeat
            }
            throw LoginCancelled(
                "WorkOS rejected the request: ${message?.errorDescription ?: message?.error ?: response.statusCode()}",
                transient,
            )
        }
        throw LoginCancelled("WorkOS is temporarily unreachable.", transient = true)
    }

    private fun post(
        url: String,
        form: Map<String, String>,
    ): HttpResponse<String> {
        val body = form.entries.joinToString("&") { "${enc(it.key)}=${enc(it.value)}" }
        val request =
            HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build()
        return http.send(request, HttpResponse.BodyHandlers.ofString())
    }

    // ── Shapes & parsing ─────────────────────────────────────────────────────

    class TokenResponse(
        val accessToken: String,
        val refreshToken: String?,
        val user: WorkosUser?,
    )

    class WorkosUser(val id: String, val email: String)

    // WorkOS returns snake_case JSON; Gson maps fields by exact name, so the
    // wire keys must be annotated or every value parses as null.
    class JsonObjectResponse {
        @com.google.gson.annotations.SerializedName("access_token")
        val accessToken: String? = null

        @com.google.gson.annotations.SerializedName("refresh_token")
        val refreshToken: String? = null

        @com.google.gson.annotations.SerializedName("error")
        val error: String? = null

        @com.google.gson.annotations.SerializedName("error_description")
        val errorDescription: String? = null

        @com.google.gson.annotations.SerializedName("user")
        val user: WorkosUser? = null
    }

    private fun parseToken(body: JsonObjectResponse): TokenResponse {
        val access = body.accessToken
        if (access.isNullOrBlank()) {
            throw LoginCancelled("WorkOS returned no access token.")
        }
        return TokenResponse(access, body.refreshToken, body.user)
    }

    private fun parseJson(body: String): JsonObjectResponse? =
        runCatching { gson().fromJson(body, JsonObjectResponse::class.java) }.getOrNull()

    private fun str(
        obj: com.google.gson.JsonObject,
        key: String,
    ): String? = obj.get(key)?.takeIf { it.isJsonPrimitive && !it.asJsonPrimitive.isNumber }?.asString

    private fun errorMessage(body: String): String? = parseJson(body)?.let { it.errorDescription ?: it.error }

    private fun oauthError(body: String): String? = parseJson(body)?.error

    internal fun isTransientFailure(
        statusCode: Int,
        error: String?,
    ): Boolean =
        error != "invalid_grant" &&
            (statusCode == 408 || statusCode == 429 || statusCode >= 500)

    private fun enc(v: String): String = URLEncoder.encode(v, StandardCharsets.UTF_8)

    private fun gson() = com.google.gson.Gson()
}
