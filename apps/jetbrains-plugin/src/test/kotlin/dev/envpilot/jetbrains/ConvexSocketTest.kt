package dev.envpilot.jetbrains

import com.google.gson.JsonObject
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
import java.util.concurrent.atomic.AtomicReference

class ConvexSocketTest {
    @Test
    fun `query changes send one delta and one version step`() {
        val socket = ConvexSocket("https://example.convex.cloud", { "token" }, NoopListener)
        val webSocket = RecordingWebSocket()

        socket.onOpen(webSocket)
        webSocket.awaitMessage("ModifyQuerySet")
        val first = socket.subscribe("first:path", mapOf("projectId" to "p1"))
        socket.subscribe("second:path", mapOf("projectId" to "p2"))
        socket.unsubscribe(first)
        webSocket.awaitMessage("ModifyQuerySet", count = 4)
        socket.stop()

        val changes = webSocket.frames("ModifyQuerySet")
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
    fun `sends issued while one is pending arrive in order`() {
        val socket = ConvexSocket("https://example.convex.cloud", { "token" }, NoopListener)
        val webSocket = RecordingWebSocket()
        socket.onOpen(webSocket)
        webSocket.awaitMessage("ModifyQuerySet")

        Thread { socket.subscribe("first:path", emptyMap()) }.apply { start() }.join()
        Thread { socket.subscribe("second:path", emptyMap()) }.apply { start() }.join()
        webSocket.awaitMessage("ModifyQuerySet", count = 3)

        assertTrue(socket.connected.get())
        assertEquals(
            listOf("first:path", "second:path"),
            webSocket.frames("ModifyQuerySet").drop(1).map {
                it.getAsJsonArray("modifications")[0].asJsonObject.get("udfPath").asString
            },
        )
        socket.stop()
    }

    @Test
    fun `a mutation issued while disconnected is sent after connect`() =
        runBlocking {
            val socket = ConvexSocket("https://example.convex.cloud", { "token" }, NoopListener)
            val mutation = async(Dispatchers.IO) { socket.mutation("some:mutation", emptyMap()) }
            val webSocket = RecordingWebSocket()

            socket.onOpen(webSocket)
            webSocket.awaitMessage("Mutation")
            socket.onText(webSocket, """{"type":"MutationResponse","requestId":0,"success":true,"result":"ok"}""", true)

            assertEquals("\"ok\"", mutation.await())
            socket.stop()
        }

    @Test
    fun `disconnect fails actions and resends queries on reconnect`() =
        runBlocking {
            val socket = ConvexSocket("https://example.convex.cloud", { "token" }, NoopListener)
            val webSocket = RecordingWebSocket()
            socket.onOpen(webSocket)
            webSocket.awaitMessage("ModifyQuerySet")

            val action = async(Dispatchers.IO) { runCatching { socket.action("some:action", emptyMap()) } }
            val query = async(Dispatchers.IO) { socket.query("some:query", emptyMap()) }
            webSocket.awaitMessage("Action")
            webSocket.awaitMessage("ModifyQuerySet", count = 2)
            socket.onClose(webSocket, 1000, "bye")

            assertTrue(action.await().exceptionOrNull()?.message.orEmpty().contains("Connection lost"))
            assertFalse(socket.connected.get())

            val reconnected = RecordingWebSocket()
            socket.onOpen(reconnected)
            reconnected.awaitMessage("ModifyQuerySet")
            socket.onText(
                reconnected,
                """{"type":"Transition","modifications":[{"type":"QueryUpdated","queryId":0,"value":[1]}]}""",
                true,
            )

            assertEquals("[1]", query.await())
            socket.stop()
        }

    private fun JsonObject.types(): List<String> = getAsJsonArray("modifications").map { it.asJsonObject.get("type").asString }

    private object NoopListener : ConvexSocket.Listener {
        override fun onQueryUpdated(queryId: Int) = Unit

        override fun onQueryFailed(queryId: Int) = Unit

        override fun onAuthError(error: String) = Unit

        override fun onConnected() = Unit

        override fun onDisconnected() = Unit
    }

    private class RecordingWebSocket : WebSocket {
        val messages = java.util.Collections.synchronizedList(mutableListOf<String>())
        private val inFlight = AtomicReference<CompletableFuture<WebSocket>?>(null)

        fun frames(type: String): List<JsonObject> =
            synchronized(messages) { messages.toList() }
                .map { JsonParser.parseString(it).asJsonObject }
                .filter { it.get("type").asString == type }

        fun awaitMessage(
            type: String,
            count: Int = 1,
        ) {
            val deadline = System.currentTimeMillis() + 5_000
            while (System.currentTimeMillis() < deadline) {
                if (frames(type).size >= count) return
                inFlight.getAndSet(null)?.complete(this)
                Thread.sleep(10)
            }
            throw AssertionError("timed out waiting for $count $type frame(s); saw $messages")
        }

        override fun sendText(
            data: CharSequence,
            last: Boolean,
        ): CompletableFuture<WebSocket> {
            val future = CompletableFuture<WebSocket>()
            check(inFlight.compareAndSet(null, future)) { "sendText while a send is pending" }
            messages += data.toString()
            return future
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
