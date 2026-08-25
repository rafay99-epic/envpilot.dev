package dev.envpilot.jetbrains.convex

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.envpilot.jetbrains.model.Org
import dev.envpilot.jetbrains.model.Project
import dev.envpilot.jetbrains.model.PullMeta
import dev.envpilot.jetbrains.model.PullResult
import dev.envpilot.jetbrains.model.PulledVariable
import dev.envpilot.jetbrains.model.SecretFileMeta

/**
 * Typed data-plane client over the Convex socket. Same functions the web app,
 * CLI and extension use — one enforcement core, no separate REST surface.
 */
object ConvexApi {
    private val gson = com.google.gson.Gson()

    private fun socket(): ConvexSocket =
        ConvexSyncService.getInstance().socketOrNull()
            ?: error("Not connected — real-time sync is offline")

    suspend fun orgs(): List<Org> {
        val body = socket().query("features/organizations/queries:listForUser", emptyMap())
        return parseArray(body).map { o ->
            Org(o.str("_id") ?: "", o.str("name") ?: "", o.str("slug") ?: "", o.str("role"))
        }
    }

    suspend fun projects(organizationId: String): List<Project> =
        parseArray(
            socket().query(
                "features/projects/queries:listWithStats",
                mapOf("organizationId" to organizationId),
            ),
        ).map { p ->
            Project(
                id = p.str("_id") ?: "",
                name = p.str("name") ?: "",
                slug = p.str("slug") ?: "",
                organizationId = organizationId,
                variableCount = p.get("variableCount")?.takeIf { it.isJsonPrimitive }?.asInt ?: 0,
            )
        }

    suspend fun pullValues(
        projectId: String,
        environment: String?,
        metadataOnly: Boolean,
    ): PullResult {
        val body =
            socket().action(
                "features/variables/values:pullValues",
                buildMap {
                    put("projectId", projectId)
                    environment?.let { put("environment", it) }
                    put("metadataOnly", metadataOnly)
                },
            )
        val obj = parseObject(body)
        val variables =
            obj.getAsJsonArray("variables")?.map { el ->
                val v = el.asJsonObject
                PulledVariable(
                    key = v.str("key") ?: "",
                    value = v.str("value") ?: "",
                    environments = v.getAsJsonArray("environments")?.map { it.asString }.orEmpty(),
                    isSensitive = v.get("isSensitive")?.asBoolean ?: true,
                )
            }.orEmpty()
        val meta = obj.getAsJsonObject("meta")
        return PullResult(
            variables = variables.filter { it.key.isNotBlank() },
            meta =
                PullMeta(
                    decryptionFailures = meta?.getAsJsonArray("decryptionFailures")?.map { it.asString },
                    role = meta?.str("role"),
                ),
        )
    }

    suspend fun listFiles(
        projectId: String,
        environment: String?,
    ): List<SecretFileMeta> {
        val body =
            socket().query(
                "features/files/queries:list",
                buildMap {
                    put("projectId", projectId)
                    environment?.let { put("environment", it) }
                },
            )
        return parseArray(body).map { f ->
            SecretFileMeta(
                id = f.str("_id") ?: "",
                name = f.str("name") ?: "",
                path = f.str("path") ?: f.str("name") ?: "",
                mode = f.octal("mode"),
                size = f.get("size")?.takeIf { it.isJsonPrimitive }?.asLong ?: 0L,
            )
        }
    }

    suspend fun fileContent(fileId: String): Pair<SecretFileMeta, ByteArray> {
        val body =
            socket().action(
                "features/files/values:getFileContent",
                mapOf("fileId" to fileId, "source" to "jetbrains"),
            )
        val obj = parseObject(body)
        val meta =
            SecretFileMeta(
                id = fileId,
                name = obj.str("name") ?: "",
                path = obj.str("path") ?: obj.str("name") ?: "",
                mode = obj.octal("mode"),
                size = obj.get("size")?.takeIf { it.isJsonPrimitive }?.asLong ?: 0L,
            )
        val bytes = java.util.Base64.getDecoder().decode(obj.str("content") ?: "")
        return meta to bytes
    }

    suspend fun createVariableRequest(
        projectId: String,
        key: String,
        value: String,
        environments: List<String>,
        isSensitive: Boolean,
        description: String?,
    ) {
        socket().action(
            "features/variables/requests/actions:createWithValue",
            buildMap {
                put("projectId", projectId)
                put("key", key)
                put("value", value)
                put("environments", environments)
                put("isSensitive", isSensitive)
                description?.let { put("description", it) }
            },
        )
    }

    // ── Parsing helpers (wire boundary) ──────────────────────────────────────

    private fun parseArray(body: String): List<JsonObject> =
        try {
            val parsed = JsonParser.parseString(body)
            when {
                parsed.isJsonNull -> emptyList()
                parsed.isJsonArray -> parsed.asJsonArray.map { it.asJsonObject }
                else -> emptyList()
            }
        } catch (_: Exception) {
            emptyList()
        }

    private fun parseObject(body: String): JsonObject = JsonParser.parseString(body).asJsonObject

    private fun JsonObject.str(key: String): String? = get(key)?.takeIf { it.isJsonPrimitive && !it.asJsonPrimitive.isNumber }?.asString

    private fun JsonObject.octal(key: String): Int? =
        get(key)?.takeIf { it.isJsonPrimitive }?.asString?.let {
            runCatching { Integer.parseInt(it.removePrefix("0o"), 8) }.getOrNull()
        }
}
