package com.pranaveda.app.ui.chat

import android.app.Application
import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pranaveda.app.model.ChatItem
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.net.ChatEvent
import com.pranaveda.app.net.ChatMessage
import com.pranaveda.app.net.ChatRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The conversation with Amrita.
 *
 * Signed out (the only mode so far on Android), the wellness profile lives on
 * this device and travels with each message, as in the signed-out web app;
 * Amrita sends back the updated profile, which is stored here.
 */
class ChatViewModel(application: Application) : AndroidViewModel(application) {
    var items by mutableStateOf(listOf<ChatItem>())
        private set
    var isStreaming by mutableStateOf(false)
        private set
    var profile by mutableStateOf(JsonObject(emptyMap()))
        private set

    private val api = ApiClient()
    private val prefs = application.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
    private var streamJob: Job? = null

    init {
        profile = prefs.getString(PROFILE_KEY, null)
            ?.let { runCatching { PvJson.parseToJsonElement(it).jsonObject }.getOrNull() }
            ?: JsonObject(emptyMap())
    }

    val profileName: String?
        get() = runCatching { profile["name"]?.jsonPrimitive?.contentOrNull }.getOrNull()?.takeIf { it.isNotBlank() }

    fun send(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || isStreaming) return

        items = items + ChatItem(ChatItem.Role.User, trimmed)
        val history = items
            .map { ChatMessage(it.role.wire, it.modelContent) }
            .filter { it.content.isNotEmpty() }
            .takeLast(30)
        val reply = ChatItem(ChatItem.Role.Assistant, streaming = true)
        items = items + reply
        isStreaming = true

        val now = LocalDateTime.now()
        val request = ChatRequest(
            messages = history,
            profile = profile,
            localTime = now.format(LOCAL_TIME),
            localDate = localDate(LocalDate.now()),
        )

        streamJob = viewModelScope.launch {
            try {
                api.chat(request).collect { apply(it, reply.id) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w("PranaVeda", "Chat request failed", e)
                update(reply.id) {
                    it.copy(
                        failed = true,
                        text = it.text.ifEmpty { "I lost the thread of our connection for a moment. Please try sending that again — I am still here." },
                    )
                }
            } finally {
                update(reply.id) { it.copy(streaming = false) }
                if (streamJob == coroutineContext[Job]) isStreaming = false
            }
        }
    }

    /** Starts a fresh conversation. The wellness profile is kept. */
    fun reset() {
        streamJob?.cancel()
        streamJob = null
        items = emptyList()
        isStreaming = false
    }

    private fun apply(event: ChatEvent, id: String) {
        when (event) {
            is ChatEvent.Text -> update(id) { it.copy(text = it.text + event.delta) }
            is ChatEvent.Card -> update(id) { it.copy(cards = it.cards + event.card) }
            is ChatEvent.Profile -> {
                profile = event.profile
                prefs.edit().putString(PROFILE_KEY, event.profile.toString()).apply()
            }
            is ChatEvent.Error -> update(id) { it.copy(failed = true, text = it.text.ifEmpty { event.message }) }
            ChatEvent.Done -> Unit
        }
    }

    private fun update(id: String, change: (ChatItem) -> ChatItem) {
        items = items.map { if (it.id == id) change(it) else it }
    }

    companion object {
        private const val PROFILE_KEY = "pranaveda_profile"

        /** Like the iOS app's "10/14/2026, 3:04:05 PM". */
        private val LOCAL_TIME = DateTimeFormatter.ofPattern("M/d/yyyy, h:mm:ss a", Locale.US)

        /** The device's calendar day as "YYYY-MM-DD". */
        fun localDate(date: LocalDate = LocalDate.now(ZoneId.systemDefault())): String =
            date.format(DateTimeFormatter.ISO_LOCAL_DATE)
    }
}
