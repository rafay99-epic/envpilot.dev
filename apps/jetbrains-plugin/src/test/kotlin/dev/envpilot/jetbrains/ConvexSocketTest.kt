package dev.envpilot.jetbrains

import com.google.gson.JsonParser
import dev.envpilot.jetbrains.convex.ConvexSocket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.http.WebSocket
import java.nio.ByteBuffer
import java.util.concurrent.CompletableFuture

class ConvexSocketTest {
    @Test
    fun `query changes send one delta and one version step`() {
        val socket = ConvexSocket("https://example.convex.cloud", { null }, NoopListener)
        val webSocket = RecordingWebSocket()

        socket.onOpen(webSocket)
        webSocket.awaitMessage("ModifyQuerySet")
        val first = socket.subscribe("first:path", mapOf("projectId" to "p1"))
        socket.subscribe("second:path", mapOf("projectId" to "p2"))
        socket.unsubscribe(first)
        socket.stop()

        val changes =
            webSocket.messages.mapNotNull { message ->
                JsonParser.parseString(message).asJsonObject.takeIf { it.get("type").asString == "ModifyQuerySet" }
            }
        assertEquals(4, changes.size)
        changes.forEachIndexed { index, message ->
            assertEquals(index, message.get("baseVersion").asInt)
            assertEquals(index + 1, message.get("newVersion").asInt)
        }
        assertEquals(0, changes[0].getAsJsonArray("modifications").size())
        assertEquals(listOf("Add"), changes[1].types())
        assertEquals(listOf("Add"), changes[2].types())
        assertEquals(listOf("Remove"), changes[3].types())
    }

    @Test
    fun `open sends connect then authenticate then the query set`() {
        val socket = ConvexSocket("https://example.convex.cloud", { "token" }, NoopListener)
        val webSocket = RecordingWebSocket()

        socket.onOpen(webSocket)
        webSocket.awaitMessage("ModifyQuerySet")
        socket.stop()

        assertEquals(
            listOf("Connect", "Authenticate", "ModifyQuerySet"),
            webSocket.messages.map { JsonParser.parseString(it).asJsonObject.get("type").asString },
        )
    }

    @Test
    fun `disconnect fails pending queries and actions`() =
        runBlocking {
            val socket = ConvexSocket("https://example.convex.cloud", { "token" }, NoopListener)
            val webSocket = RecordingWebSocket()
            socket.onOpen(webSocket)
            webSocket.awaitMessage("ModifyQuerySet")

            val action = async(Dispatchers.IO) { runCatching { socket.action("some:action", emptyMap()) } }
            val query = async(Dispatchers.IO) { runCatching { socket.query("some:query", emptyMap()) } }
            webSocket.awaitMessage("Action")
            webSocket.awaitMessage("ModifyQuerySet", count = 2)
            socket.onClose(webSocket, 1000, "bye")

            assertTrue(action.await().exceptionOrNull()?.message.orEmpty().contains("socket disconnected"))
            assertTrue(query.await().exceptionOrNull()?.message.orEmpty().contains("socket disconnected"))
            assertFalse(socket.connected.get())
            socket.stop()
        }

    private fun com.google.gson.JsonObject.types(): List<String> =
        getAsJsonArray("modifications").map { it.asJsonObject.get("type").asString }

    private object NoopListener : ConvexSocket.Listener {
        override fun onQueryUpdated(queryId: Int) = Unit

        override fun onQueryFailed(queryId: Int) = Unit

        override fun onAuthError(error: String) = Unit

        override fun onConnected() = Unit

        override fun onDisconnected() = Unit
    }

    private class RecordingWebSocket : WebSocket {
        val messages = java.util.Collections.synchronizedList(mutableListOf<String>())

        /** The open handshake finishes on a coroutine now, so tests wait for its frames. */
        fun awaitMessage(
            type: String,
            count: Int = 1,
        ) {
            val deadline = System.currentTimeMillis() + 5_000
            while (System.currentTimeMillis() < deadline) {
                val seen =
                    synchronized(messages) {
                        messages.count { JsonParser.parseString(it).asJsonObject.get("type").asString == type }
                    }
                if (seen >= count) return
                Thread.sleep(10)
            }
            throw AssertionError("timed out waiting for $count $type frame(s); saw $messages")
        }

        override fun sendText(
            data: CharSequence,
            last: Boolean,
        ): CompletableFuture<WebSocket> {
            messages += data.toString()
            return CompletableFuture.completedFuture(this)
        }

        override fun sendBinary(
            data: ByteBuffer,
            last: Boolean,
        ) = CompletableFuture.completedFuture<WebSocket>(this)

        override fun sendPing(message: ByteBuffer) = CompletableFuture.completedFuture<WebSocket>(this)

        override fun sendPong(message: ByteBuffer) = CompletableFuture.completedFuture<WebSocket>(this)

        override fun sendClose(
            statusCode: Int,
            reason: String,
        ) = CompletableFuture.completedFuture<WebSocket>(this)

        override fun request(n: Long) = Unit

        override fun getSubprotocol() = ""

        override fun isOutputClosed() = false

        override fun isInputClosed() = false

        override fun abort() = Unit
    }
}
