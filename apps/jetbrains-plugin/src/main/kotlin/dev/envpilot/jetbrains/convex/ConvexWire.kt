package dev.envpilot.jetbrains.convex

import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * Convex WebSocket sync-protocol wire encoding (boundary).
 * Message shapes mirror convex-js src/browser/sync/protocol.ts exactly:
 * JSON objects over text frames; timestamps are base64 little-endian u64
 * which we never need to construct (only Connect omits it).
 */
object ConvexWire {
    sealed interface ServerMessage {
        data object Ping : ServerMessage

        data class Transition(val updatedQueryIds: List<Int>, val failedQueryIds: List<Int>) : ServerMessage

        data class AuthError(val error: String) : ServerMessage

        data class FatalError(val error: String) : ServerMessage

        data object Other : ServerMessage
    }

    data class QueryAdd(val queryId: Int, val udfPath: String, val args: Map<String, Any?>)

    fun connectMessage(
        sessionId: String,
        connectionCount: Int,
    ): String {
        val obj =
            JsonObject().apply {
                addProperty("type", "Connect")
                addProperty("sessionId", sessionId)
                addProperty("connectionCount", connectionCount)
                add("lastCloseReason", com.google.gson.JsonNull.INSTANCE)
                addProperty("clientTs", System.currentTimeMillis())
            }
        return gson.toJson(obj)
    }

    fun authenticateMessage(
        token: String,
        identityVersion: Int,
    ): String =
        gson.toJson(
            mapOf(
                "type" to "Authenticate",
                "tokenType" to "User",
                "value" to token,
                "baseVersion" to identityVersion,
            ),
        )

    /**
     * Add/remove query subscriptions in one message. Args are a JSON array
     * with a single object — the shape convex-js puts on the wire for
     * single-argument queries.
     */
    fun modifyQuerySetMessage(
        baseVersion: Int,
        newVersion: Int,
        adds: List<QueryAdd>,
        removes: List<Int>,
    ): String {
        val modifications = mutableListOf<Map<String, Any?>>()
        for (add in adds) {
            modifications.add(
                mapOf(
                    "type" to "Add",
                    "queryId" to add.queryId,
                    "udfPath" to add.udfPath,
                    "args" to listOf(add.args),
                ),
            )
        }
        for (id in removes) {
            modifications.add(mapOf("type" to "Remove", "queryId" to id))
        }
        return gson.toJson(
            mapOf(
                "type" to "ModifyQuerySet",
                "baseVersion" to baseVersion,
                "newVersion" to newVersion,
                "modifications" to modifications,
            ),
        )
    }

    fun actionMessage(
        requestId: Int,
        udfPath: String,
        args: Map<String, Any?>,
    ): String = functionMessage("Action", requestId, udfPath, args)

    fun mutationMessage(
        requestId: Int,
        udfPath: String,
        args: Map<String, Any?>,
    ): String = functionMessage("Mutation", requestId, udfPath, args)

    private fun functionMessage(
        type: String,
        requestId: Int,
        udfPath: String,
        args: Map<String, Any?>,
    ): String =
        gson.toJson(
            mapOf(
                "type" to type,
                "requestId" to requestId,
                "udfPath" to udfPath,
                "args" to listOf(args),
            ),
        )

    data class ActionResponse(val requestId: Int, val success: Boolean, val result: String?, val error: String?)

    /** Parse action/mutation responses; null for any other message type. */
    fun parseFunctionResponse(text: String): ActionResponse? =
        try {
            val obj = JsonParser.parseString(text).asJsonObject
            if (obj.str("type") !in setOf("ActionResponse", "MutationResponse")) {
                null
            } else if (obj.get("success").asBoolean) {
                ActionResponse(obj.get("requestId").asInt, true, obj.get("result")?.toString() ?: "null", null)
            } else {
                ActionResponse(obj.get("requestId").asInt, false, null, obj.str("result") ?: "action failed")
            }
        } catch (_: Exception) {
            null
        }

    fun parseServerMessage(text: String): ServerMessage =
        try {
            val obj = JsonParser.parseString(text).asJsonObject
            when (obj.str("type")) {
                "Ping" -> ServerMessage.Ping
                "Transition" -> parseTransition(obj)
                "AuthError" -> ServerMessage.AuthError(obj.str("error") ?: "auth error")
                "FatalError" -> ServerMessage.FatalError(obj.str("error") ?: "fatal error")
                else -> ServerMessage.Other
            }
        } catch (_: Exception) {
            ServerMessage.Other
        }

    /**
     * Raw JSON value of a QueryUpdated modification, or null when the
     * transition has none for [queryId]. One-shot queries await this; live
     * subscribers ignore it.
     */
    fun queryValueFromTransition(
        text: String,
        queryId: Int,
    ): String? =
        try {
            val obj = JsonParser.parseString(text).asJsonObject
            if (obj.str("type") != "Transition") {
                null
            } else {
                findQueryValue(obj, queryId)?.toString()
            }
        } catch (_: Exception) {
            null
        }

    private fun findQueryValue(
        obj: JsonObject,
        queryId: Int,
    ): com.google.gson.JsonElement? {
        val modifications = obj.getAsJsonArray("modifications") ?: return null
        for (mod in modifications) {
            val m = mod.asJsonObject
            if (m.str("type") != "QueryUpdated") continue
            if (m.get("queryId").asInt != queryId) continue
            return m.get("value")
        }
        return null
    }

    private fun parseTransition(obj: JsonObject): ServerMessage.Transition {
        val updated = mutableListOf<Int>()
        val failed = mutableListOf<Int>()
        for (mod in obj.getAsJsonArray("modifications") ?: return ServerMessage.Transition(emptyList(), emptyList())) {
            val m = mod.asJsonObject
            when (m.str("type")) {
                "QueryUpdated" -> m.get("queryId")?.asInt?.let { updated.add(it) }
                "QueryFailed" -> m.get("queryId")?.asInt?.let { failed.add(it) }
            }
        }
        return ServerMessage.Transition(updated, failed)
    }

    private val gson = com.google.gson.GsonBuilder().serializeNulls().create()

    private fun JsonObject.str(key: String): String? = get(key)?.takeIf { it.isJsonPrimitive }?.asString
}
