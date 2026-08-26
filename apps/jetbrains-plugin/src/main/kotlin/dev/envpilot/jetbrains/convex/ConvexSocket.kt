package dev.envpilot.jetbrains.convex

import com.intellij.openapi.diagnostic.logger
import java.net.URI
import java.net.http.HttpClient
import java.net.http.WebSocket
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CompletionStage
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * Convex WebSocket lifecycle: connect → Connect → Authenticate → subscribe,
 * with reconnect/backoff and a 60s server-inactivity watchdog (the server
 * pings every 15s when healthy — same thresholds as convex-js).
 *
 * Pure transport: callers decide what subscriptions mean.
 */
class ConvexSocket(
    private val deploymentUrl: String,
    private val tokenProvider: suspend () -> String?,
    private val listener: Listener,
) : WebSocket.Listener {
    interface Listener {
        /** A subscribed query produced an updated result. */
        fun onQueryUpdated(queryId: Int)

        /** A subscribed query failed server-side. */
        fun onQueryFailed(queryId: Int)

        fun onAuthError(error: String)

        fun onConnected()

        fun onDisconnected()
    }

    private val log = logger<ConvexSocket>()
    private val http: HttpClient =
        HttpClient.newBuilder()
            .version(java.net.http.HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build()
    private val watchdog =
        Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "envpilot-convex-watchdog").apply { isDaemon = true }
        }

    private val webSocket = AtomicReference<WebSocket?>(null)
    private val connectionCount = AtomicInteger(0)
    private val identityVersion = AtomicInteger(0)
    private val querySetVersion = AtomicInteger(0)
    private val queryIdCounter = AtomicInteger(0)
    private val subscriptions = AtomicReference<Map<Int, String>>(emptyMap())
    private val argsByQueryId = AtomicReference<Map<Int, Map<String, Any?>>>(emptyMap())
    private val stopped = AtomicBoolean(false)
    private val actionRequestId = AtomicInteger(0)
    private val pendingActions = AtomicReference<Map<Int, kotlinx.coroutines.CompletableDeferred<ConvexWire.ActionResponse>>>(emptyMap())
    private val pendingQueries = AtomicReference<Map<Int, kotlinx.coroutines.CompletableDeferred<String>>>(emptyMap())
    private val lastServerMessageAt = AtomicLong(0)
    private val reconnectAttempt = AtomicInteger(0)
    private val incomingText = StringBuilder()

    val connected = AtomicBoolean(false)

    /** Subscribe (or re-subscribe) to a query; assigns and returns its query id. */
    fun subscribe(
        udfPath: String,
        args: Map<String, String>,
    ): Int {
        val queryId = queryIdCounter.getAndIncrement()
        subscriptions.updateAndGet { it + (queryId to udfPath) }
        argsByQueryId.updateAndGet { it + (queryId to args) }
        sendQueryChanges(
            adds = listOf(ConvexWire.QueryAdd(queryId, udfPath, args)),
            removes = emptyList(),
        )
        return queryId
    }

    fun unsubscribe(queryId: Int) {
        val existed = subscriptions.get().containsKey(queryId)
        subscriptions.updateAndGet { it - queryId }
        argsByQueryId.updateAndGet { it - queryId }
        if (existed) sendQueryChanges(emptyList(), listOf(queryId))
    }

    fun start() {
        stopped.set(false)
        connect()
        startWatchdog()
    }

    fun stop() {
        stopped.set(true)
        watchdog.shutdownNow()
        webSocket.getAndSet(null)?.sendClose(WebSocket.NORMAL_CLOSURE, "bye")
    }

    /**
     * One-shot action call over the socket (e.g. pullValues). Fails fast when
     * the socket is down — callers fall back or surface the error.
     */
    suspend fun action(
        udfPath: String,
        args: Map<String, Any?>,
    ): String = executeFunction(ConvexWire::actionMessage, udfPath, args)

    suspend fun mutation(
        udfPath: String,
        args: Map<String, Any?>,
    ): String = executeFunction(ConvexWire::mutationMessage, udfPath, args)

    private suspend fun executeFunction(
        message: (Int, String, Map<String, Any?>) -> String,
        udfPath: String,
        args: Map<String, Any?>,
    ): String {
        val ws = webSocket.get()?.takeIf { connected.get() } ?: error("Convex socket not connected")
        val requestId = actionRequestId.getAndIncrement()
        val deferred = kotlinx.coroutines.CompletableDeferred<ConvexWire.ActionResponse>()
        pendingActions.updateAndGet { it + (requestId to deferred) }
        try {
            ws.sendText(message(requestId, udfPath, args), true)
            val response = kotlinx.coroutines.withTimeout(30_000) { deferred.await() }
            if (!response.success) error(response.error ?: "action failed")
            return response.result ?: error("action returned no result")
        } finally {
            pendingActions.updateAndGet { it - requestId }
        }
    }

    /**
     * One-shot query: subscribe, take the first result, unsubscribe. The
     * result is the raw JSON value (plain JSON — Convex numbers are doubles).
     */
    suspend fun query(
        udfPath: String,
        args: Map<String, String>,
    ): String {
        webSocket.get()?.takeIf { connected.get() } ?: error("Convex socket not connected")
        val queryId = queryIdCounter.getAndIncrement()
        val deferred = kotlinx.coroutines.CompletableDeferred<String>()
        pendingQueries.updateAndGet { it + (queryId to deferred) }
        subscriptions.updateAndGet { it + (queryId to udfPath) }
        argsByQueryId.updateAndGet { it + (queryId to args) }
        try {
            sendQueryChanges(
                adds = listOf(ConvexWire.QueryAdd(queryId, udfPath, args)),
                removes = emptyList(),
            )
            return kotlinx.coroutines.withTimeout(30_000) { deferred.await() }
        } finally {
            pendingQueries.updateAndGet { it - queryId }
            unsubscribe(queryId)
        }
    }

    fun reauthenticate(token: String) {
        send(ConvexWire.authenticateMessage(token, identityVersion.getAndIncrement()))
    }

    private fun connect() {
        if (stopped.get()) return
        val wsUrl =
            deploymentUrl
                .replace("https://", "wss://")
                .replace("http://", "ws://")
                .trimEnd('/') + "/api/sync"
        http.newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .buildAsync(URI.create(wsUrl), this)
            .whenComplete { ws, error ->
                if (stopped.get()) {
                    ws?.sendClose(WebSocket.NORMAL_CLOSURE, "bye")
                    return@whenComplete
                }
                if (error != null) {
                    log.warn("Convex socket connect failed: ${error.message}")
                    scheduleReconnect()
                }
            }
    }

    private fun handleOpen(ws: WebSocket) {
        webSocket.set(ws)
        connected.set(true)
        reconnectAttempt.set(0)
        querySetVersion.set(0)
        identityVersion.set(0)
        lastServerMessageAt.set(System.currentTimeMillis())
        val count = connectionCount.incrementAndGet()
        ws.sendText(
            ConvexWire.connectMessage(
                sessionId = UUID.randomUUID().toString(),
                connectionCount = count,
            ),
            true,
        )
        sendFullQuerySet()
        val token = kotlinx.coroutines.runBlocking { tokenProvider() }
        if (token == null) {
            log.warn("Convex socket has no token — auth skipped")
        } else {
            send(ConvexWire.authenticateMessage(token, identityVersion.getAndIncrement()))
        }
        listener.onConnected()
        ws.request(1)
    }

    @Synchronized
    private fun sendQueryChanges(
        adds: List<ConvexWire.QueryAdd>,
        removes: List<Int>,
    ) {
        val ws = webSocket.get() ?: return
        val base = querySetVersion.get()
        val newVersion = base + 1
        ws.sendText(
            ConvexWire.modifyQuerySetMessage(
                baseVersion = base,
                newVersion = newVersion,
                adds = adds,
                removes = removes,
            ),
            true,
        )
        querySetVersion.set(newVersion)
    }

    private fun sendFullQuerySet() {
        sendQueryChanges(
            adds =
                subscriptions.get().map { (id, path) ->
                    ConvexWire.QueryAdd(id, path, argsByQueryId.get()[id] ?: emptyMap())
                },
            removes = emptyList(),
        )
    }

    private fun send(text: String) {
        webSocket.get()?.sendText(text, true)
    }

    private fun handleDisconnect(ws: WebSocket) {
        if (!webSocket.compareAndSet(ws, null)) return
        // Never leave callers awaiting a response from a dead socket.
        for (deferred in pendingActions.get().values) {
            deferred.complete(
                ConvexWire.ActionResponse(-1, false, null, "socket disconnected"),
            )
        }
        for (deferred in pendingQueries.get().values) {
            deferred.completeExceptionally(IllegalStateException("socket disconnected"))
        }
        if (connected.getAndSet(false)) {
            listener.onDisconnected()
        }
        scheduleReconnect()
    }

    private fun scheduleReconnect() {
        if (stopped.get()) return
        val attempt = reconnectAttempt.getAndIncrement()
        val delayMs = minOf(30_000L, 1000L * (1 shl attempt.coerceAtMost(5)))
        watchdog.schedule({ connect() }, delayMs, TimeUnit.MILLISECONDS)
    }

    /** Reconnect if the server has been silent past the inactivity threshold. */
    private fun startWatchdog() {
        watchdog.scheduleWithFixedDelay({
            if (stopped.get()) return@scheduleWithFixedDelay
            val silentFor = System.currentTimeMillis() - lastServerMessageAt.get()
            if (connected.get() && silentFor > 60_000) {
                log.warn("Convex socket inactive ${silentFor}ms — reconnecting")
                val ws = webSocket.get() ?: return@scheduleWithFixedDelay
                handleDisconnect(ws)
                ws.abort()
            }
        }, 60, 60, TimeUnit.SECONDS)
    }

    // ── WebSocket.Listener ───────────────────────────────────────────────────

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
        if (text == null) {
            ws.request(1)
            return null
        }
        ConvexWire.parseFunctionResponse(text)?.let { response ->
            pendingActions.get()[response.requestId]?.complete(response)
            ws.request(1)
            return null
        }
        when (val message = ConvexWire.parseServerMessage(text)) {
            is ConvexWire.ServerMessage.Ping -> Unit // resets inactivity timer only
            is ConvexWire.ServerMessage.Transition -> {
                for (id in message.updatedQueryIds) {
                    val deferred = pendingQueries.get()[id]
                    val value = ConvexWire.queryValueFromTransition(text, id)
                    if (deferred != null && value != null) {
                        deferred.complete(value)
                    } else {
                        listener.onQueryUpdated(id)
                    }
                }
                for (id in message.failedQueryIds) {
                    pendingQueries.get()[id]?.completeExceptionally(
                        IllegalStateException("query failed"),
                    )
                    listener.onQueryFailed(id)
                }
            }
            is ConvexWire.ServerMessage.AuthError -> {
                pendingActions.get().values.forEach {
                    it.complete(ConvexWire.ActionResponse(-1, false, null, "auth error: ${message.error}"))
                }
                pendingQueries.get().values.forEach {
                    it.completeExceptionally(IllegalStateException("auth error: ${message.error}"))
                }
                listener.onAuthError(message.error)
            }
            is ConvexWire.ServerMessage.FatalError -> {
                log.warn("Convex socket fatal error: ${message.error}")
                ws.abort()
            }
            ConvexWire.ServerMessage.Other -> Unit
        }
        ws.request(1)
        return null
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

    @Synchronized
    private fun completeTextMessage(
        data: CharSequence,
        last: Boolean,
    ): String? {
        incomingText.append(data)
        if (!last) return null
        return incomingText.toString().also { incomingText.setLength(0) }
    }
}
