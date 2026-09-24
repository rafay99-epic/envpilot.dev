package dev.envpilot.jetbrains.auth

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.annotations.SerializedName
import com.intellij.ide.BrowserUtil
import dev.envpilot.jetbrains.BuildConfig
import kotlinx.coroutines.delay
import kotlinx.coroutines.future.await
import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

object AuthKitLogin {
    private const val DEVICE_AUTHORIZE_URL = "https://api.workos.com/user_management/authorize/device"
    private const val AUTHENTICATE_URL = "https://api.workos.com/user_management/authenticate"
    private const val DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

    class LoginCancelled(message: String, val transient: Boolean = false, cause: Throwable? = null) : Exception(message, cause)

    private val gson = Gson()
    private val http: HttpClient =
        HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build()

    suspend fun signIn(onUserCode: (String) -> Unit): TokenResponse {
        val device = requestDeviceCode()
        onUserCode(device.userCode)
        BrowserUtil.browse(device.verificationUriComplete)
        val deadline = System.currentTimeMillis() + device.expiresIn * 1000L
        var intervalSeconds = device.interval
        while (System.currentTimeMillis() < deadline) {
            delay(intervalSeconds * 1000L)
            when (val poll = pollForToken(device.deviceCode)) {
                is PollResult.Complete -> return poll.token
                PollResult.Pending, PollResult.Network -> Unit
                PollResult.SlowDown -> intervalSeconds += 5
                PollResult.Denied -> throw LoginCancelled("Sign-in was denied in the browser.")
                PollResult.Expired -> throw LoginCancelled("The sign-in code expired. Start again.")
            }
        }
        throw LoginCancelled("Sign-in timed out: no browser approval.")
    }

    suspend fun refresh(refreshToken: String): TokenResponse =
        parseToken(
            postAuthenticate(
                mapOf(
                    "grant_type" to "refresh_token",
                    "client_id" to BuildConfig.WORKOS_CLIENT_ID,
                    "refresh_token" to refreshToken,
                ),
            ),
        )

    private class DeviceCode(
        val deviceCode: String,
        val userCode: String,
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

    private suspend fun requestDeviceCode(): DeviceCode {
        val response =
            try {
                post(DEVICE_AUTHORIZE_URL, mapOf("client_id" to BuildConfig.WORKOS_CLIENT_ID))
            } catch (e: IOException) {
                throw LoginCancelled("Could not reach WorkOS to start authentication.", transient = true, cause = e)
            }
        if (response.statusCode() >= 400) {
            val message = errorMessage(parseJson(response.body()))
            throw LoginCancelled(
                message?.let { "WorkOS rejected the device-code request: $it" }
                    ?: "WorkOS rejected the device-code request.",
                transient = response.statusCode() >= 500,
            )
        }
        val obj =
            try {
                JsonParser.parseString(response.body()).asJsonObject
            } catch (_: Exception) {
                throw LoginCancelled("WorkOS returned an unexpected device-code response.")
            }
        val values =
            listOf(
                str(obj, "device_code"),
                str(obj, "user_code"),
                str(obj, "verification_uri_complete"),
            ).map { value ->
                value?.takeIf { it.isNotBlank() }
                    ?: throw LoginCancelled("WorkOS returned an unexpected device-code response.")
            }
        return DeviceCode(
            deviceCode = values[0],
            userCode = values[1],
            verificationUriComplete = values[2],
            expiresIn = obj.get("expires_in")?.takeIf { it.isJsonPrimitive }?.asInt ?: 300,
            interval = obj.get("interval")?.takeIf { it.isJsonPrimitive }?.asInt ?: 5,
        )
    }

    private suspend fun pollForToken(deviceCode: String): PollResult {
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
            } catch (_: IOException) {
                return PollResult.Network
            }
        val body = parseJson(response.body())
        if (response.statusCode() < 400) {
            return body?.let { PollResult.Complete(parseToken(it)) } ?: PollResult.Network
        }
        return when (body?.error) {
            "authorization_pending" -> PollResult.Pending
            "slow_down" -> PollResult.SlowDown
            "access_denied" -> PollResult.Denied
            "expired_token" -> PollResult.Expired
            else ->
                if (isTransientFailure(response.statusCode(), body?.error)) {
                    PollResult.Network
                } else {
                    throw LoginCancelled("WorkOS rejected the sign-in: ${errorMessage(body) ?: response.statusCode()}")
                }
        }
    }

    private suspend fun postAuthenticate(form: Map<String, String>): JsonObjectResponse {
        repeat(3) { attempt ->
            if (attempt > 0) delay(250L shl (attempt - 1))
            val response =
                try {
                    post(AUTHENTICATE_URL, form)
                } catch (e: IOException) {
                    if (attempt < 2) return@repeat
                    throw LoginCancelled("WorkOS is temporarily unreachable.", transient = true, cause = e)
                }
            val body = parseJson(response.body())
            if (response.statusCode() < 400) {
                return body ?: throw LoginCancelled("WorkOS returned an unexpected response.", transient = true)
            }
            val transient = isTransientFailure(response.statusCode(), body?.error)
            if (transient && attempt < 2) return@repeat
            throw LoginCancelled("WorkOS rejected the request: ${errorMessage(body) ?: response.statusCode()}", transient)
        }
        throw LoginCancelled("WorkOS is temporarily unreachable.", transient = true)
    }

    private suspend fun post(
        url: String,
        form: Map<String, String>,
    ): HttpResponse<String> {
        val request =
            HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form.entries.joinToString("&") { "${enc(it.key)}=${enc(it.value)}" }))
                .build()
        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString()).await()
    }

    class TokenResponse(
        val accessToken: String,
        val refreshToken: String?,
        val user: WorkosUser?,
    )

    class WorkosUser(val id: String, val email: String)

    class JsonObjectResponse {
        @SerializedName("access_token")
        val accessToken: String? = null

        @SerializedName("refresh_token")
        val refreshToken: String? = null

        @SerializedName("error")
        val error: String? = null

        @SerializedName("error_description")
        val errorDescription: String? = null

        @SerializedName("user")
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
        runCatching {
            gson.fromJson(
                body,
                JsonObjectResponse::class.java,
            )
        }.getOrNull()

    private fun errorMessage(body: JsonObjectResponse?): String? = body?.errorDescription ?: body?.error

    private fun str(
        obj: JsonObject,
        key: String,
    ): String? = obj.get(key)?.takeIf { it.isJsonPrimitive && !it.asJsonPrimitive.isNumber }?.asString

    internal fun isTransientFailure(
        statusCode: Int,
        error: String?,
    ): Boolean =
        error != "invalid_grant" &&
            (statusCode == 408 || statusCode == 429 || statusCode >= 500)

    private fun enc(v: String): String = URLEncoder.encode(v, StandardCharsets.UTF_8)
}
