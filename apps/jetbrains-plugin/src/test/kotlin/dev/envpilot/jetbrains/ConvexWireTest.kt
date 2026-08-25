package dev.envpilot.jetbrains

import com.google.gson.JsonParser
import dev.envpilot.jetbrains.convex.ConvexWire
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Wire-format fixtures pinned to the shapes convex-js puts on the WebSocket
 * (src/browser/sync/protocol.ts). If these break, real-time sync breaks.
 */
class ConvexWireTest {
    @Test
    fun `connect message shape matches protocol`() {
        val json =
            JsonParser.parseString(
                ConvexWire.connectMessage(sessionId = "sess-1", connectionCount = 3),
            ).asJsonObject
        assertEquals("Connect", json.get("type").asString)
        assertEquals("sess-1", json.get("sessionId").asString)
        assertEquals(3, json.get("connectionCount").asInt)
        assertTrue(json.get("lastCloseReason").isJsonNull)
        assertTrue(json.has("clientTs"))
    }

    @Test
    fun `authenticate message shape matches protocol`() {
        val json =
            JsonParser.parseString(
                ConvexWire.authenticateMessage(token = "env_token", identityVersion = 2),
            ).asJsonObject
        assertEquals("Authenticate", json.get("type").asString)
        assertEquals("User", json.get("tokenType").asString)
        assertEquals("env_token", json.get("value").asString)
        assertEquals(2, json.get("baseVersion").asInt)
    }

    @Test
    fun `modify query set wraps args in a single-element array`() {
        val json =
            JsonParser.parseString(
                ConvexWire.modifyQuerySetMessage(
                    baseVersion = 0,
                    newVersion = 1,
                    adds =
                        listOf(
                            ConvexWire.QueryAdd(
                                queryId = 0,
                                udfPath = "features/ide/queries:projectVersion",
                                args = mapOf("projectId" to "p123"),
                            ),
                        ),
                    removes = emptyList(),
                ),
            ).asJsonObject
        assertEquals("ModifyQuerySet", json.get("type").asString)
        assertEquals(0, json.get("baseVersion").asInt)
        assertEquals(1, json.get("newVersion").asInt)
        val mod = json.getAsJsonArray("modifications").get(0).asJsonObject
        assertEquals("Add", mod.get("type").asString)
        assertEquals(0, mod.get("queryId").asInt)
        assertEquals("features/ide/queries:projectVersion", mod.get("udfPath").asString)
        val args = mod.getAsJsonArray("args")
        assertEquals(1, args.size())
        assertEquals("p123", args.get(0).asJsonObject.get("projectId").asString)
    }

    @Test
    fun `modify query set includes removals`() {
        val json =
            JsonParser.parseString(
                ConvexWire.modifyQuerySetMessage(1, 2, emptyList(), removes = listOf(4)),
            ).asJsonObject
        val mod = json.getAsJsonArray("modifications").get(0).asJsonObject
        assertEquals("Remove", mod.get("type").asString)
        assertEquals(4, mod.get("queryId").asInt)
    }

    @Test
    fun `parses ping`() {
        assertEquals(ConvexWire.ServerMessage.Ping, ConvexWire.parseServerMessage("""{"type":"Ping"}"""))
    }

    @Test
    fun `parses transition with updated and failed queries`() {
        val message =
            """
            {"type":"Transition",
             "startVersion":{"querySet":1,"ts":"AAA=","identity":0},
             "endVersion":{"querySet":2,"ts":"AAE=","identity":0},
             "modifications":[
               {"type":"QueryUpdated","queryId":0,"value":42,"logLines":[]},
               {"type":"QueryFailed","queryId":1,"errorMessage":"boom","logLines":[]}
             ]}
            """.trimIndent()
        val parsed = ConvexWire.parseServerMessage(message)
        assertTrue(parsed is ConvexWire.ServerMessage.Transition)
        assertEquals(listOf(0), (parsed as ConvexWire.ServerMessage.Transition).updatedQueryIds)
        assertEquals(listOf(1), parsed.failedQueryIds)
    }

    @Test
    fun `parses auth and fatal errors`() {
        val auth = ConvexWire.parseServerMessage("""{"type":"AuthError","error":"expired","baseVersion":0,"authUpdateAttempted":true}""")
        assertEquals("expired", (auth as ConvexWire.ServerMessage.AuthError).error)
        val fatal = ConvexWire.parseServerMessage("""{"type":"FatalError","error":"nope"}""")
        assertEquals("nope", (fatal as ConvexWire.ServerMessage.FatalError).error)
    }

    @Test
    fun `garbage parses to Other not a crash`() {
        assertEquals(ConvexWire.ServerMessage.Other, ConvexWire.parseServerMessage("not json"))
        assertEquals(ConvexWire.ServerMessage.Other, ConvexWire.parseServerMessage("""{"type":"Unknown"}"""))
    }

    @Test
    fun `query result number reads plain and int64-wrapped values`() {
        val plain =
            """
            {"type":"Transition","modifications":[
              {"type":"QueryUpdated","queryId":3,"value":1724592000000}
            ]}
            """.trimIndent()
        assertEquals(1724592000000L, ConvexWire.queryResultNumber(plain, 3))
        // int64 encoding: base64 little-endian bytes of 1000
        val wrapped =
            """
            {"type":"Transition","modifications":[
              {"type":"QueryUpdated","queryId":3,
               "value":{"${'$'}encoding":"int64","bytes":"AP8AAAAAAAA="}}
            ]}
            """.trimIndent()
        // LE bytes [0,255,0,0,0,0,0,0] → 0xFF << 8 = 65280
        assertEquals(65280L, ConvexWire.queryResultNumber(wrapped, 3))
        assertNull(ConvexWire.queryResultNumber("""{"type":"Transition","modifications":[]}""", 3))
    }
}
