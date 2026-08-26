package dev.envpilot.jetbrains

import com.google.gson.JsonParser
import dev.envpilot.jetbrains.convex.ConvexSocket
import org.junit.Assert.assertEquals
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
        val messages = mutableListOf<String>()

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
