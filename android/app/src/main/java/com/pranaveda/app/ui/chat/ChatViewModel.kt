package com.pranaveda.app.ui.chat

import android.app.Application
import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AccountUser
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.model.ChatItem
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.net.ChatEvent
import com.pranaveda.app.net.ChatMessage
import com.pranaveda.app.net.ChatRequest
import com.pranaveda.app.net.HttpStatusException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
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
 * Signed out, the wellness profile lives on this device and travels with each
 * message, as in the signed-out web app. Signed in, the server reads and saves
 * the profile in the account instead (the copy sent is ignored), and the copy
 * here is kept in step with it.
 */
class ChatViewModel(application: Application) : AndroidViewModel(application) {
    var items by mutableStateOf(listOf<ChatItem>())
        private set
    var isStreaming by mutableStateOf(false)
        private set
    var profile by mutableStateOf(JsonObject(emptyMap()))
        private set

    private val api = ApiClient()
    private val accounts = AccountApi(api)
    private val auth: AuthStore = (application as PranaVedaApplication).auth
    private val health = (application as PranaVedaApplication).health
    private val prefs = application.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
    private var streamJob: Job? = null

    /** Speaks the reply to a spoken message (the app's AmritaVoice), and stops whatever is still being said. */
    var speakReply: ((String) -> Unit)? = null
    var stopSpeaking: (() -> Unit)? = null

    init {
        profile = readProfile(PROFILE_KEY) ?: JsonObject(emptyMap())
        // The profile and the practice log both follow the account.
        val practice = (application as PranaVedaApplication).practice
        val voice = application.voice
        speakReply = voice::speak
        stopSpeaking = voice::stop
        auth.onSignedIn = {
            adoptAccountProfile(it)
            practice.adoptAccount(it)
            application.saved.adoptAccount(it)
        }
        auth.onSignedOut = {
            handBackDevice()
            practice.handBackDevice()
            application.saved.handBackDevice()
        }
    }

    val profileName: String?
        get() = runCatching { profile["name"]?.jsonPrimitive?.contentOrNull }.getOrNull()?.takeIf { it.isNotBlank() }

    /** "beginner", "regular" or "experienced"; null when not set (G2). */
    val experience: String?
        get() = runCatching { profile["experience"]?.jsonPrimitive?.contentOrNull }.getOrNull()

    /**
     * Changed in the You tab. Signed in, the account is the profile, so the
     * server sets it; signed out, the profile here goes with every message.
     * False when it could not be saved.
     */
    suspend fun changeExperience(value: String?): Boolean {
        if (auth.user != null) {
            val token = auth.validAccessToken() ?: return false
            return runCatching { storeProfile(accounts.saveAccountExperience(value, token).profile) }.isSuccess
        }
        storeProfile(JsonObject(profile.toMutableMap().apply { if (value == null) remove("experience") else put("experience", JsonPrimitive(value)) }))
        return true
    }

    /**
     * Who to greet: the name they gave Amrita, else (signed in) their account
     * name, as on the website. Guests are greeted by name only if they told Amrita.
     */
    val greetingName: String?
        get() = profileName ?: auth.user?.displayName?.takeIf { it.isNotBlank() }

    /** Sends a message. A [spoken] one is marked as voice for the server, and its reply is read aloud, as on the website. */
    fun send(text: String, spoken: Boolean = false) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || isStreaming) return
        stopSpeaking?.invoke()

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
            inputMode = if (spoken) "voice" else "text",
            health = health.summaryForAmrita(),
        )

        streamJob = viewModelScope.launch {
            try {
                val token = auth.validAccessToken()
                try {
                    api.chat(request, token).collect { apply(it, reply.id) }
                } catch (e: HttpStatusException) {
                    if (e.status != 401 || token == null) throw e
                    // The sign-in had expired: refresh once and resend. If the
                    // session is over, the resend goes out signed out.
                    api.chat(request, auth.tokenAfterRejection()).collect { apply(it, reply.id) }
                }
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
            // Speak in kind: cards stay silent, Amrita's own sentence introduces them.
            val said = items.firstOrNull { it.id == reply.id }
            if (spoken && said != null && !said.failed && said.text.isNotBlank()) speakReply?.invoke(said.text)
        }
    }

    // Profile and the account. While signed in, the profile here is a copy of
    // the account's. OWNER_KEY records whose, and BACKUP_KEY the device's own
    // profile from before sign-in, which is put back on sign-out (as on the
    // website and iOS).

    /**
     * After sign-in: if the account has no profile yet, this device's becomes
     * the account's; otherwise the account's replaces the copy here.
     */
    private suspend fun adoptAccountProfile(user: AccountUser) {
        val token = auth.validAccessToken() ?: return
        try {
            val account = accounts.fetchAccountProfile(token)
            // Only the first time this device's profile is taken over is it the
            // device's own, worth keeping to put back later.
            if (prefs.getString(OWNER_KEY, null) == null) {
                prefs.edit().apply {
                    if (profile.isEmpty()) remove(BACKUP_KEY) else putString(BACKUP_KEY, profile.toString())
                }.apply()
            }
            prefs.edit().putString(OWNER_KEY, user.id).apply()

            if (account.version == 0) {
                if (profile.isEmpty()) return
                storeProfile(accounts.saveAccountProfile(profile, baseVersion = 0, accessToken = token).profile)
            } else {
                storeProfile(account.profile)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Offline or unavailable: the copy here stays; sync runs again next launch.
            Log.w("PranaVeda", "Profile sync failed", e)
        }
    }

    /**
     * After sign-out (by any route): the account's profile leaves this device,
     * and the device's own pre-sign-in profile comes back.
     */
    private fun handBackDevice() {
        if (prefs.getString(OWNER_KEY, null) == null) return
        storeProfile(readProfile(BACKUP_KEY) ?: JsonObject(emptyMap()))
        prefs.edit().remove(OWNER_KEY).remove(BACKUP_KEY).apply()
    }

    private fun storeProfile(value: JsonObject) {
        profile = value
        prefs.edit().putString(PROFILE_KEY, value.toString()).apply()
    }

    private fun readProfile(key: String): JsonObject? =
        prefs.getString(key, null)?.let { runCatching { PvJson.parseToJsonElement(it).jsonObject }.getOrNull() }

    /** Starts a fresh conversation. The wellness profile is kept. */
    fun reset() {
        streamJob?.cancel()
        stopSpeaking?.invoke()
        streamJob = null
        items = emptyList()
        isStreaming = false
    }

    private fun apply(event: ChatEvent, id: String) {
        when (event) {
            is ChatEvent.Text -> update(id) { it.copy(text = it.text + event.delta) }
            is ChatEvent.Card -> update(id) { it.copy(cards = it.cards + event.card) }
            is ChatEvent.Profile -> storeProfile(event.profile)
            is ChatEvent.Error -> update(id) { it.copy(failed = true, text = it.text.ifEmpty { event.message }) }
            ChatEvent.Done -> Unit
        }
    }

    private fun update(id: String, change: (ChatItem) -> ChatItem) {
        items = items.map { if (it.id == id) change(it) else it }
    }

    companion object {
        private const val PROFILE_KEY = "pranaveda_profile"
        private const val OWNER_KEY = "pranaveda_profile_owner"
        private const val BACKUP_KEY = "pranaveda_profile_before_signin"

        /** Like the iOS app's "10/14/2026, 3:04:05 PM". */
        internal val LOCAL_TIME = DateTimeFormatter.ofPattern("M/d/yyyy, h:mm:ss a", Locale.US)

        /** The device's calendar day as "YYYY-MM-DD". */
        fun localDate(date: LocalDate = LocalDate.now(ZoneId.systemDefault())): String =
            date.format(DateTimeFormatter.ISO_LOCAL_DATE)
    }
}
