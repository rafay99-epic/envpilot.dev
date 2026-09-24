package dev.envpilot.jetbrains.convex

import com.intellij.openapi.diagnostic.logger
import dev.envpilot.jetbrains.auth.Jwt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.future.await
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.net.URI
import java.net.http.HttpClient
import java.net.http.WebSocket
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CompletionStage
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class ConvexSocket(
    private val deploymentUrl: String,
    private val tokenProvider: suspend () -> String?,
    private val listener: Listener,
) : WebSocket.Listener {
    interface Listener {
        fun onQueryUpdated(queryId: Int)

        fun onQueryFailed(queryId: Int)

        fun onAuthError(error: String)

        fun onConnected()

        fun onDisconnected()
    }

    private val log = logger<ConvexSocket>()
    private val http: HttpClient =
        HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Any()
    private val sessionId = UUID.randomUUID().toString()

    private var webSocket: WebSocket? = null
    private var outbound: Channel<String>? = null
    private var reauthJob: Job? = null
    private var connectionCount = 0
    private var identityVersion = 0
    private var querySetVersion = 0
    private var nextQueryId = 0
    private var nextRequestId = 0
    private val subscriptions = LinkedHashMap<Int, ConvexWire.QueryAdd>()
    private val pendingQueries = HashMap<Int, CompletableDeferred<String>>()
    private val pendingMutations = HashMap<Int, Pair<String, CompletableDeferred<ConvexWire.ActionResponse>>>()
    private val pendingActions = HashMap<Int, Pair<String, CompletableDeferred<ConvexWire.ActionResponse>>>()
    private val incomingText = StringBuilder()

    @Volatile private var stopped = false
    private val lastServerMessageAt = AtomicLong(0)
    private val reconnectAttempt = AtomicInteger(0)

    val connected = AtomicBoolean(false)

    fun subscribe(
        udfPath: String,
        args: Map<String, String>,
    ): Int =
        synchronized(lock) {
            val add = ConvexWire.QueryAdd(nextQueryId++, udfPath, args)
            subscriptions[add.queryId] = add
            sendQueryChangesLocked(listOf(add), emptyList())
            add.queryId
        }

    fun unsubscribe(queryId: Int) {
        synchronized(lock) {
            if (subscriptions.remove(queryId) != null) sendQueryChangesLocked(emptyList(), listOf(queryId))
        }
    }

    fun start() {
        connect()
        scope.launch { watchInactivity() }
    }

    fun stop() {
        val ws =
            synchronized(lock) {
                stopped = true
                val error = IllegalStateException("Convex socket stopped")
                pendingQueries.values.forEach { it.completeExceptionally(error) }
                pendingQueries.clear()
                failLocked(pendingMutations, error)
                failLocked(pendingActions, error)
                outbound?.close()
                outbound = null
                connected.set(false)
                webSocket.also { webSocket = null }
            }
        scope.cancel()
        ws?.sendClose(WebSocket.NORMAL_CLOSURE, "bye")
        http.shutdown()
    }

    suspend fun action(
        udfPath: String,
        args: Map<String, Any?>,
    ): String = executeFunction(pendingActions, ConvexWire::actionMessage, udfPath, args)

    suspend fun mutation(
        udfPath: String,
        args: Map<String, Any?>,
    ): String = executeFunction(pendingMutations, ConvexWire::mutationMessage, udfPath, args)

    private suspend fun executeFunction(
        pending: MutableMap<Int, Pair<String, CompletableDeferred<ConvexWire.ActionResponse>>>,
        message: (Int, String, Map<String, Any?>) -> String,
        udfPath: String,
        args: Map<String, Any?>,
    ): String {
        val deferred = CompletableDeferred<ConvexWire.ActionResponse>()
        val requestId =
            synchronized(lock) {
                check(!stopped) { "Convex socket stopped" }
                val id = nextRequestId++
                val text = message(id, udfPath, args)
                pending[id] = text to deferred
                if (connected.get()) outbound?.trySend(text)
                id
            }
        try {
            val response = withTimeout(30_000) { deferred.await() }
            if (!response.success) error(response.error ?: "action failed")
            return response.result ?: error("action returned no result")
        } finally {
            synchronized(lock) { pending.remove(requestId) }
        }
    }

    suspend fun query(
        udfPath: String,
        args: Map<String, String>,
    ): String {
        val deferred = CompletableDeferred<String>()
        val queryId =
            synchronized(lock) {
                check(!stopped) { "Convex socket stopped" }
                subscribe(udfPath, args).also { pendingQueries[it] = deferred }
            }
        try {
            return withTimeout(30_000) { deferred.await() }
        } finally {
            synchronized(lock) { pendingQueries.remove(queryId) }
            unsubscribe(queryId)
        }
    }

    fun reauthenticate(token: String) {
        synchronized(lock) {
            if (!connected.get()) return
            outbound?.trySend(ConvexWire.authenticateMessage(token, identityVersion++))
        }
        scheduleReauth(token)
    }

    private fun scheduleReauth(token: String) {
        val exp = Jwt.exp(token) ?: return
        val job =
            scope.launch {
                delay((exp * 1000 - System.currentTimeMillis() - 60_000).coerceAtLeast(30_000))
                tokenProvider()?.let(::reauthenticate)
            }
        synchronized(lock) { reauthJob.also { reauthJob = job } }?.cancel()
    }

    private fun connect() {
        if (stopped) return
        val wsUrl =
            deploymentUrl
                .replace("https://", "wss://")
                .replace("http://", "ws://")
                .trimEnd('/') + "/api/sync"
        http.newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .buildAsync(URI.create(wsUrl), this)
            .whenComplete { ws, error ->
                if (stopped) {
                    ws?.sendClose(WebSocket.NORMAL_CLOSURE, "bye")
                } else if (error != null) {
                    log.warn("Convex socket connect failed: ${error.message}")
                    scheduleReconnect()
                }
            }
    }

    private fun handleOpen(ws: WebSocket) {
        val channel = Channel<String>(Channel.UNLIMITED)
        synchronized(lock) {
            if (stopped) {
                ws.abort()
                return
            }
            webSocket = ws
            outbound = channel
            querySetVersion = 0
            identityVersion = 0
            incomingText.setLength(0)
            lastServerMessageAt.set(System.currentTimeMillis())
            channel.trySend(ConvexWire.connectMessage(sessionId, ++connectionCount))
        }
        scope.launch { drain(ws, channel) }
        scope.launch { handshake(ws, channel) }
        ws.request(1)
    }

    private suspend fun drain(
        ws: WebSocket,
        channel: Channel<String>,
    ) {
        try {
            for (text in channel) ws.sendText(text, true).await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            log.warn("Convex socket send failed: ${e.message}")
            abort(ws)
        }
    }

    private suspend fun handshake(
        ws: WebSocket,
        channel: Channel<String>,
    ) {
        val token =
            try {
                tokenProvider()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log.warn("Convex socket token fetch failed: ${e.message}")
                null
            }
        if (token == null) {
            log.warn("Convex socket has no token; reconnecting")
            abort(ws)
            return
        }
        synchronized(lock) {
            if (webSocket !== ws) return
            channel.trySend(ConvexWire.authenticateMessage(token, identityVersion++))
            connected.set(true)
            channel.trySend(ConvexWire.modifyQuerySetMessage(0, 1, subscriptions.values.toList(), emptyList()))
            querySetVersion = 1
            (pendingMutations + pendingActions).toSortedMap().values.forEach { channel.trySend(it.first) }
        }
        scheduleReauth(token)
        listener.onConnected()
    }

    private fun sendQueryChangesLocked(
        adds: List<ConvexWire.QueryAdd>,
        removes: List<Int>,
    ) {
        if (!connected.get()) return
        val message = ConvexWire.modifyQuerySetMessage(querySetVersion, querySetVersion + 1, adds, removes)
        if (outbound?.trySend(message)?.isSuccess == true) querySetVersion++
    }

    private fun failLocked(
        requests: MutableMap<Int, Pair<String, CompletableDeferred<ConvexWire.ActionResponse>>>,
        error: Throwable,
    ) {
        requests.values.forEach { it.second.completeExceptionally(error) }
        requests.clear()
    }

    private fun abort(ws: WebSocket) {
        handleDisconnect(ws)
        ws.abort()
    }

    private fun handleDisconnect(ws: WebSocket) {
        val wasConnected =
            synchronized(lock) {
                if (webSocket !== ws) return
                webSocket = null
                outbound?.close()
                outbound = null
                incomingText.setLength(0)
                reauthJob?.cancel()
                if (connected.get()) {
                    failLocked(pendingActions, IllegalStateException("Connection lost while action was in flight"))
                }
                connected.getAndSet(false)
            }
        if (wasConnected) listener.onDisconnected()
        scheduleReconnect()
    }

    private fun scheduleReconnect() {
        if (stopped) return
        val attempt = reconnectAttempt.getAndIncrement()
        scope.launch {
            delay(minOf(30_000L, 1000L shl attempt.coerceAtMost(5)))
            connect()
        }
    }

    private suspend fun watchInactivity() {
        while (scope.isActive) {
            delay(60_000)
            val ws = synchronized(lock) { webSocket?.takeIf { connected.get() } } ?: continue
            val silentFor = System.currentTimeMillis() - lastServerMessageAt.get()
            if (silentFor > 60_000) {
                log.warn("Convex socket inactive ${silentFor}ms; reconnecting")
                abort(ws)
            }
        }
    }

    override fun onOpen(ws: WebSocket) {
        handleOpen(ws)
    }

    override fun onText(
        ws: WebSocket,
        data: CharSequence,
        last: Boolean,
    ): CompletionStage<*>? {
        lastServerMessageAt.set(System.currentTimeMillis())
        val text = completeTextMessage(data, last)
        if (text != null) handleMessage(ws, text)
        ws.request(1)
        return null
    }

    private fun handleMessage(
        ws: WebSocket,
        text: String,
    ) {
        ConvexWire.parseFunctionResponse(text)?.let { response ->
            synchronized(lock) {
                pendingMutations.remove(response.requestId) ?: pendingActions.remove(response.requestId)
            }?.second?.complete(response)
            return
        }
        when (val message = ConvexWire.parseServerMessage(text)) {
            is ConvexWire.ServerMessage.Transition -> {
                reconnectAttempt.set(0)
                for (id in message.updatedQueryIds) {
                    val deferred = synchronized(lock) { pendingQueries[id] }
                    val value = ConvexWire.queryValueFromTransition(text, id)
                    if (deferred != null && value != null) {
                        deferred.complete(value)
                    } else {
                        listener.onQueryUpdated(id)
                    }
                }
                for ((id, reason) in message.failedQueries) {
                    synchronized(lock) {
                        pendingQueries[id]?.completeExceptionally(
                            IllegalStateException("query failed: ${subscriptions[id]?.udfPath}: $reason"),
                        )
                    }
                    listener.onQueryFailed(id)
                }
            }
            is ConvexWire.ServerMessage.AuthError -> {
                val error = IllegalStateException("auth error: ${message.error}")
                synchronized(lock) {
                    pendingQueries.values.forEach { it.completeExceptionally(error) }
                    failLocked(pendingMutations, error)
                    failLocked(pendingActions, error)
                }
                listener.onAuthError(message.error)
            }
            is ConvexWire.ServerMessage.FatalError -> {
                log.warn("Convex socket fatal error: ${message.error}")
                abort(ws)
            }
            ConvexWire.ServerMessage.Ping, ConvexWire.ServerMessage.Other -> Unit
        }
    }

    override fun onError(
        ws: WebSocket,
        error: Throwable,
    ) {
        log.warn("Convex socket error: ${error.message}")
        handleDisconnect(ws)
    }

    override fun onClose(
        ws: WebSocket,
        statusCode: Int,
        reason: String,
    ): CompletionStage<*>? {
        handleDisconnect(ws)
        return null
    }

    private fun completeTextMessage(
        data: CharSequence,
        last: Boolean,
    ): String? =
        synchronized(lock) {
            incomingText.append(data)
            if (last) incomingText.toString().also { incomingText.setLength(0) } else null
        }
}
