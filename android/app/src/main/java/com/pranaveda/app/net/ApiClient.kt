package com.pranaveda.app.net

import com.pranaveda.app.health.HealthSummary
import com.pranaveda.app.config.AppConfig
import com.pranaveda.app.model.Catalog
import com.pranaveda.app.model.ChatCard
import com.pranaveda.app.model.DailyInsight
import com.pranaveda.app.model.DoshaGuide
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.place.LocationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** One event from the chat stream. */
sealed interface ChatEvent {
    data class Text(val delta: String) : ChatEvent
    data class Card(val card: ChatCard) : ChatEvent
    data class Profile(val profile: JsonObject) : ChatEvent
    data class Error(val message: String) : ChatEvent
    data object Done : ChatEvent
}

class HttpStatusException(val status: Int) : IOException("The server answered $status.")

@Serializable
data class ChatMessage(val role: String, val content: String)

@Serializable
data class ChatRequest(
    val messages: List<ChatMessage>,
    val profile: JsonObject,
    val localTime: String,
    /**
     * The device's calendar day ("YYYY-MM-DD"), so the server dates profile
     * writes by the user's day rather than UTC's.
     */
    val localDate: String,
    val inputMode: String = "text",
    val previousSession: List<ChatMessage>? = null,
    /** Their sleep and heart readings beside their usual, only when they have let Amrita see them. */
    val health: HealthSummary? = null,
    /** The kind of place they are in (home, work, …), only when they have turned location on. Never coordinates. */
    val location: LocationContext? = null,
)

class ApiClient(
    internal val baseUrl: HttpUrl = AppConfig.apiBaseUrl,
    internal val http: OkHttpClient = sharedHttp,
) {
    /**
     * Streams Amrita's reply. Signed out, the device sends its profile and
     * receives the updated one, exactly as the web app does.
     *
     * With a [bearer] token the request is sent as the signed-in person; an
     * expired or invalid one gets [HttpStatusException] 401 before anything streams.
     */
    fun chat(request: ChatRequest, bearer: String? = null): Flow<ChatEvent> = flow {
        val call = http.newCall(
            Request.Builder()
                .url(baseUrl.resolve("api/chat")!!)
                .header("Accept", "text/event-stream")
                .apply { if (bearer != null) header("Authorization", "Bearer $bearer") }
                .post(PvJson.encodeToString(ChatRequest.serializer(), request).toRequestBody(JSON))
                .build(),
        )
        // A blocked read only notices cancellation when the call itself is
        // cancelled, so cancel it as soon as the collector goes away.
        val cancelOnStop = currentCoroutineContext()[Job]?.invokeOnCompletion { call.cancel() }
        try {
            call.execute().use { response ->
                if (response.code != 200) throw HttpStatusException(response.code)
                val source = response.body.source()
                val parser = SseParser()
                val buffer = ByteArray(8 * 1024)
                while (true) {
                    currentCoroutineContext().ensureActive()
                    // Returns as soon as some bytes arrive, so text appears as it streams.
                    val count = source.read(buffer)
                    if (count == -1) break
                    for (payload in parser.feed(buffer, 0, count)) decodeEvent(payload)?.let { emit(it) }
                }
                parser.finish()?.let(::decodeEvent)?.let { emit(it) }
            }
        } finally {
            // Leaving early (a new conversation, the screen closing) stops the request.
            cancelOnStop?.dispose()
            call.cancel()
        }
    }.flowOn(Dispatchers.IO)

    suspend fun catalog(): Catalog = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url(baseUrl.resolve("api/catalog")!!).build()).execute().use { response ->
            if (response.code != 200) throw HttpStatusException(response.code)
            PvJson.decodeFromString(Catalog.serializer(), response.body.string())
        }
    }

    suspend fun doshaGuide(): DoshaGuide = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url(baseUrl.resolve("api/dosha-guide")!!).build()).execute().use { response ->
            if (response.code != 200) throw HttpStatusException(response.code)
            PvJson.decodeFromString(DoshaGuide.serializer(), response.body.string())
        }
    }

    /** Amrita's daily reflection, made personal by the wellness [profile]. */
    suspend fun dailyInsight(profile: JsonObject, localTime: String): DailyInsight = withContext(Dispatchers.IO) {
        val body = PvJson.encodeToString(InsightRequest.serializer(), InsightRequest(profile, localTime))
        val request = Request.Builder().url(baseUrl.resolve("api/insight")!!).post(body.toRequestBody(JSON)).build()
        http.newCall(request).execute().use { response ->
            if (response.code != 200) throw HttpStatusException(response.code)
            PvJson.decodeFromString(DailyInsight.serializer(), response.body.string())
        }
    }

    /**
     * Amrita's ElevenLabs voice for [text] (MP3), or null when the server has
     * no voice configured (it answers 503). Throws when it cannot be reached.
     */
    suspend fun speech(text: String): ByteArray? = withContext(Dispatchers.IO) {
        val body = PvJson.encodeToString(SpeechRequest.serializer(), SpeechRequest(text))
        val request = Request.Builder().url(baseUrl.resolve("api/tts")!!).post(body.toRequestBody(JSON)).build()
        http.newCall(request).execute().use { response ->
            if (response.code == 200) response.body.bytes().takeIf { it.isNotEmpty() } else null
        }
    }

    @Serializable
    private data class SpeechRequest(val text: String)

    @Serializable
    private data class InsightRequest(val profile: JsonObject, val localTime: String)

    companion object {
        internal val JSON = "application/json".toMediaType()

        val sharedHttp: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                // Amrita can pause while she thinks or calls a tool.
                .readTimeout(90, TimeUnit.SECONDS)
                .build()
        }

        /** One `data:` payload as an event; null for anything unreadable or unknown. */
        fun decodeEvent(payload: String): ChatEvent? {
            val envelope = runCatching { PvJson.parseToJsonElement(payload).jsonObject }.getOrNull() ?: return null
            fun string(key: String) = runCatching { envelope[key]?.jsonPrimitive?.contentOrNull }.getOrNull()
            return when (string("type")) {
                "text" -> string("delta")?.let(ChatEvent::Text)
                "card" -> runCatching { ChatCard.decode(envelope.getValue("card").jsonObject) }.getOrNull()?.let(ChatEvent::Card)
                "profile" -> ChatEvent.Profile(runCatching { envelope["profile"]?.jsonObject }.getOrNull() ?: JsonObject(emptyMap()))
                "error" -> ChatEvent.Error(string("message") ?: "Something went wrong.")
                "done" -> ChatEvent.Done
                else -> null
            }
        }
    }
}
