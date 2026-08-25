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
    private val argsByQueryId = AtomicReference<Map<Int, Map<String, String>>>(emptyMap())
    private val stopped = AtomicBoolean(false)
    private val lastServerMessageAt = AtomicLong(0)
    private val reconnectAttempt = AtomicInteger(0)

    val connected = AtomicBoolean(false)

    /** Subscribe (or re-subscribe) to a query; assigns and returns its query id. */
    fun subscribe(
        udfPath: String,
        args: Map<String, String>,
    ): Int {
        val queryId = queryIdCounter.getAndIncrement()
        subscriptions.updateAndGet { it + (queryId to udfPath) }
        argsByQueryId.updateAndGet { it + (queryId to args) }
        sendCurrentQuerySet()
        return queryId
    }

    fun unsubscribe(queryId: Int) {
        subscriptions.updateAndGet { it - queryId }
        argsByQueryId.updateAndGet { it - queryId }
        sendCurrentQuerySet()
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

    /** Re-authenticate with a fresh token (called when the WorkOS token rotates). */
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
                if (error != null) {
                    log.warn("Convex socket connect failed: ${error.message}")
                    scheduleReconnect()
                } else {
                    webSocket.set(ws)
                }
            }
    }

    private fun handleOpen(ws: WebSocket) {
        connected.set(true)
        reconnectAttempt.set(0)
        lastServerMessageAt.set(System.currentTimeMillis())
        val count = connectionCount.incrementAndGet()
        send(
            ConvexWire.connectMessage(
                sessionId = UUID.randomUUID().toString(),
                connectionCount = count,
            ),
        )
        // Re-authenticate on every (re)connect, then restore subscriptions.
        val token = kotlinx.coroutines.runBlocking { tokenProvider() }
        if (token == null) {
            log.warn("Convex socket has no token — auth skipped")
        } else {
            send(ConvexWire.authenticateMessage(token, identityVersion.getAndIncrement()))
        }
        sendCurrentQuerySet()
        listener.onConnected()
        ws.request(1)
    }

    private fun sendCurrentQuerySet() {
        val ws = webSocket.get() ?: return
        val subs = subscriptions.get()
        val base = querySetVersion.get()
        val newVersion = base + subs.size + 1
        val message =
            ConvexWire.modifyQuerySetMessage(
                baseVersion = base,
                newVersion = newVersion,
                adds =
                    subs.map { (id, path) ->
                        ConvexWire.QueryAdd(id, path, argsByQueryId.get()[id] ?: emptyMap())
                    },
                removes = emptyList(),
            )
        querySetVersion.set(newVersion)
        ws.sendText(message, true)
    }

    private fun send(text: String) {
        webSocket.get()?.sendText(text, true)
    }

    private fun handleDisconnect() {
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
                webSocket.getAndSet(null)?.abort()
                handleDisconnect()
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
        when (val message = ConvexWire.parseServerMessage(data.toString())) {
            is ConvexWire.ServerMessage.Ping -> Unit // resets inactivity timer only
            is ConvexWire.ServerMessage.Transition -> {
                for (id in message.updatedQueryIds) listener.onQueryUpdated(id)
                for (id in message.failedQueryIds) listener.onQueryFailed(id)
            }
            is ConvexWire.ServerMessage.AuthError -> listener.onAuthError(message.error)
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
        handleDisconnect()
    }

    override fun onClose(
        ws: WebSocket,
        statusCode: Int,
        reason: String,
    ): CompletionStage<*>? {
        handleDisconnect()
        return null
    }
}
