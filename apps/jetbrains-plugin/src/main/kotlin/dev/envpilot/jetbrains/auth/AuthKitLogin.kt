package dev.envpilot.jetbrains.auth

import com.intellij.ide.BrowserUtil
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import dev.envpilot.jetbrains.BuildConfig
import dev.envpilot.jetbrains.telemetry.EnvSentry
import java.net.InetSocketAddress
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.util.Base64
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

/**
 * WorkOS AuthKit login: OAuth2 authorization-code + PKCE, callback landing on
 * a loopback HTTP server (the JetBrains-endorsed pattern for IDE plugins).
 * Token exchange and refresh are standard WorkOS endpoints — no custom
 * protocol logic.
 */
object AuthKitLogin {
    private const val AUTHORIZE_URL = "https://api.workos.com/user_management/authorize"
    private const val AUTHENTICATE_URL = "https://api.workos.com/user_management/authenticate"
    private const val REDIRECT_PORT = 6318
    private const val REDIRECT_URI = "http://localhost:$REDIRECT_PORT/callback"

    class LoginCancelled(message: String, val transient: Boolean = false) : Exception(message)

    private val http: HttpClient =
        HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build()

    /**
     * Run the full browser login. Blocks the calling (IO) coroutine until the
     * user approves, the code is exchanged, or it times out.
     */
    fun signIn(): TokenResponse {
        val verifier = pkceVerifier()
        val challenge = pkceChallenge(verifier)
        val state = pkceVerifier()
        val codeFuture = CompletableFuture<String>()

        val server =
            try {
                startCallbackServer(codeFuture, state)
            } catch (e: java.net.BindException) {
                throw LoginCancelled(
                    "Port $REDIRECT_PORT is busy — close other IDE instances and retry.",
                    transient = true,
                )
            }
        try {
            BrowserUtil.browse(authorizeUrl(challenge, state))
            val code =
                try {
                    codeFuture.get(5, TimeUnit.MINUTES)
                } catch (e: java.util.concurrent.TimeoutException) {
                    throw LoginCancelled("Sign-in timed out — no browser approval within 5 minutes.")
                }
            return exchangeCode(code, verifier)
        } catch (e: java.util.concurrent.ExecutionException) {
            // The callback future wraps its own LoginCancelled — rethrow as-is.
            (e.cause as? LoginCancelled)?.let { throw it }
            EnvSentry.capture(e, mapOf("surface" to "authkit-login"))
            throw LoginCancelled("Sign-in failed: ${e.cause?.message ?: e.message}")
        } catch (e: Exception) {
            EnvSentry.capture(e, mapOf("surface" to "authkit-login"))
            throw LoginCancelled("Sign-in failed: ${e.message ?: e::class.simpleName}")
        } finally {
            server.stop(0)
        }
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

    // ── Internals ────────────────────────────────────────────────────────────

    private fun authorizeUrl(
        codeChallenge: String,
        state: String,
    ): String {
        val params =
            linkedMapOf(
                "client_id" to BuildConfig.WORKOS_CLIENT_ID,
                "redirect_uri" to REDIRECT_URI,
                "response_type" to "code",
                "code_challenge" to codeChallenge,
                "code_challenge_method" to "S256",
                "state" to state,
                "provider" to "authkit",
            )
        return AUTHORIZE_URL + "?" +
            params.entries.joinToString("&") { (k, v) ->
                "${enc(k)}=${enc(v)}"
            }
    }

    private fun exchangeCode(
        code: String,
        verifier: String,
    ): TokenResponse {
        val body =
            postAuthenticate(
                mapOf(
                    "grant_type" to "authorization_code",
                    "client_id" to BuildConfig.WORKOS_CLIENT_ID,
                    "code" to code,
                    "code_verifier" to verifier,
                ),
            )
        return parseToken(body)
    }

    private fun startCallbackServer(
        codeFuture: CompletableFuture<String>,
        state: String,
    ): HttpServer {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", REDIRECT_PORT), 0)
        server.createContext("/callback") { exchange ->
            val code = queryParam(exchange, "code")
            val error = queryParam(exchange, "error")
            val returnedState = queryParam(exchange, "state")
            when {
                returnedState != state -> {
                    respond(exchange, "State mismatch — aborting login.")
                    codeFuture.completeExceptionally(LoginCancelled("State mismatch — aborting login."))
                }
                error != null -> {
                    respond(exchange, "Sign-in denied: $error")
                    codeFuture.completeExceptionally(LoginCancelled("Sign-in denied: $error"))
                }
                code != null -> {
                    respond(exchange, "You are all set! You may close this window.")
                    codeFuture.complete(code)
                }
                else -> {
                    respond(exchange, "No code in callback.")
                    codeFuture.completeExceptionally(LoginCancelled("No code in callback"))
                }
            }
        }
        server.executor = null
        server.start()
        return server
    }

    private fun respond(
        exchange: HttpExchange,
        message: String,
    ) {
        val bytes =
            "<html><body>${message.replace("<", "&lt;")}</body></html>"
                .toByteArray(StandardCharsets.UTF_8)
        exchange.responseHeaders.add("Content-Type", "text/html; charset=utf-8")
        exchange.sendResponseHeaders(200, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    private fun queryParam(
        exchange: HttpExchange,
        key: String,
    ): String? =
        exchange.requestURI.query
            ?.split("&")
            ?.mapNotNull { part ->
                val idx = part.indexOf('=')
                if (idx <= 0) null else part.substring(0, idx) to part.substring(idx + 1)
            }
            ?.firstOrNull { it.first == key }
            ?.second

    private fun postAuthenticate(form: Map<String, String>): JsonObjectResponse {
        val body = form.entries.joinToString("&") { "${enc(it.key)}=${enc(it.value)}" }
        val request =
            HttpRequest.newBuilder()
                .uri(URI.create(AUTHENTICATE_URL))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() >= 400) {
            val message =
                runCatching {
                    gson().fromJson(response.body(), JsonObjectResponse::class.java)
                }.getOrNull()
            // 5xx / 429 are transient — callers keep credentials and retry.
            val transient = response.statusCode() >= 500 || response.statusCode() == 429
            throw LoginCancelled(
                "WorkOS rejected the request: ${message?.errorDescription ?: response.statusCode()}",
                transient,
            )
        }
        return gson().fromJson(response.body(), JsonObjectResponse::class.java)
            ?: throw LoginCancelled("Empty response from WorkOS")
    }

    class TokenResponse(
        val accessToken: String,
        /** WorkOS refresh grants may omit this — callers keep their old token. */
        val refreshToken: String,
        val user: WorkosUser?,
    )

    class WorkosUser(val id: String, val email: String)

    class JsonObjectResponse {
        val accessToken: String? = null
        val refreshToken: String? = null
        val errorDescription: String? = null
        val user: WorkosUser? = null
    }

    private fun parseToken(body: JsonObjectResponse): TokenResponse {
        val access = body.accessToken
        if (access.isNullOrBlank()) {
            throw LoginCancelled("WorkOS returned no access token.")
        }
        return TokenResponse(access, body.refreshToken ?: "", body.user)
    }

    private fun pkceVerifier(): String {
        val bytes = ByteArray(32)
        java.security.SecureRandom().nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun pkceChallenge(verifier: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(StandardCharsets.US_ASCII)),
        )

    private fun enc(v: String): String = URLEncoder.encode(v, StandardCharsets.UTF_8)

    private fun gson() = com.google.gson.Gson()
}
