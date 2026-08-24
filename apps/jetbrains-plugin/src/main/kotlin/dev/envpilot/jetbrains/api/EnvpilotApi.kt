package dev.envpilot.jetbrains.api

import com.google.gson.Gson
import com.google.gson.JsonObject
import dev.envpilot.jetbrains.model.*
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

class ApiError(val status: Int, message: String) : Exception(message)

/**
 * Typed HTTPS client over the /api/ide/ Next.js routes. The routes wrap Convex
 * server-side and enforce the same authz chain as every other client surface.
 */
class EnvpilotApi(private val serverUrl: String) {

    companion object {
        private val gson = Gson()
        private val http: HttpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build()
    }

    class Unauthorized : Exception("Session expired")

    fun orgs(token: String): List<Org> {
        val body = get(token, "/api/ide/orgs") ?: return emptyList()
        return body.getAsJsonArray("organizations")?.map { el ->
            val o = el.asJsonObject
            Org(o.str("_id") ?: "", o.str("name") ?: "", o.str("slug") ?: "", o.str("role"))
        } ?: emptyList()
    }

    fun projects(token: String, organizationId: String): List<Project> {
        val body = get(token, "/api/ide/projects?organizationId=${enc(organizationId)}") ?: return emptyList()
        return body.getAsJsonArray("projects")?.map { el ->
            val p = el.asJsonObject
            Project(
                id = p.str("_id") ?: "",
                name = p.str("name") ?: "",
                slug = p.str("slug") ?: "",
                organizationId = organizationId,
                variableCount = p.get("variableCount")?.takeIf { it.isJsonPrimitive }?.asInt ?: 0,
            )
        }.orEmpty()
    }

    fun pullValues(token: String, projectId: String, environment: String?, metadataOnly: Boolean): PullResult {
        val envQ = environment?.let { "&environment=${enc(it)}" } ?: ""
        val body = get(
            token,
            "/api/ide/variables?projectId=${enc(projectId)}$envQ&metadataOnly=$metadataOnly"
        ) ?: throw ApiError(500, "Empty response from server")

        val variables = body.getAsJsonArray("variables")?.map { el ->
            val v = el.asJsonObject
            PulledVariable(
                key = v.str("key") ?: "",
                value = v.str("value") ?: "",
                environments = v.getAsJsonArray("environments")?.map { it.asString }.orEmpty(),
                isSensitive = v.get("isSensitive")?.asBoolean ?: true,
            )
        }.orEmpty()
        val meta = body.getAsJsonObject("meta")
        return PullResult(
            variables = variables.filter { it.key.isNotBlank() },
            meta = PullMeta(
                decryptionFailures = meta?.getAsJsonArray("decryptionFailures")
                    ?.map { it.asString },
                role = meta?.str("role"),
            )
        )
    }

    fun listFiles(token: String, projectId: String, environment: String?): List<SecretFileMeta> {
        val envQ = environment?.let { "&environment=${enc(it)}" } ?: ""
        val body = get(token, "/api/ide/files?projectId=${enc(projectId)}$envQ") ?: return emptyList()
        return body.getAsJsonArray("files")?.map { el ->
            val f = el.asJsonObject
            SecretFileMeta(
                id = f.str("_id") ?: "",
                name = f.str("name") ?: "",
                path = f.str("path") ?: f.str("name") ?: "",
                mode = f.get("mode")?.takeIf { it.isJsonPrimitive }?.let {
                    runCatching { Integer.parseInt(it.asString.removePrefix("0o"), 8) }.getOrNull()
                },
                size = f.get("size")?.takeIf { it.isJsonPrimitive }?.asLong ?: 0L,
            )
        }.orEmpty()
    }

    fun fileContent(token: String, fileId: String): Pair<SecretFileMeta, ByteArray> {
        val body = get(token, "/api/ide/files/content?fileId=${enc(fileId)}", allow404Body = false)
            ?: throw ApiError(500, "Empty response from server")
        val meta = SecretFileMeta(
            id = fileId,
            name = body.str("name") ?: "",
            path = body.str("path") ?: body.str("name") ?: "",
            mode = body.get("mode")?.takeIf { it.isJsonPrimitive }?.let {
                runCatching { Integer.parseInt(it.asString.removePrefix("0o"), 8) }.getOrNull()
            },
            size = body.get("size")?.takeIf { it.isJsonPrimitive }?.asLong ?: 0L,
        )
        val bytes = java.util.Base64.getDecoder().decode(body.str("content") ?: "")
        return meta to bytes
    }

    private fun get(token: String, pathAndQuery: String, allow404Body: Boolean = true): JsonObject? {
        val request = HttpRequest.newBuilder()
            .uri(URI.create("$serverUrl$pathAndQuery"))
            .timeout(Duration.ofSeconds(60))
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .GET()
            .build()
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        when (response.statusCode()) {
            200 -> return gson.fromJson(response.body(), JsonObject::class.java)
            401 -> throw Unauthorized()
            else -> {
                val msg = try {
                    gson.fromJson(response.body(), JsonObject::class.java)?.str("error")
                } catch (_: Exception) {
                    null
                }
                if (response.statusCode() == 403 && msg != null) throw ApiError(403, msg)
                if (!allow404Body && response.statusCode() == 404) throw ApiError(404, "Not found")
                throw ApiError(response.statusCode(), msg ?: "Request failed (${response.statusCode()})")
            }
        }
    }
}

private fun JsonObject.str(key: String): String? =
    get(key)?.takeIf { it.isJsonPrimitive && !it.asJsonPrimitive.isNumber }?.asString

private fun enc(v: String): String = URLEncoder.encode(v, Charsets.UTF_8)
