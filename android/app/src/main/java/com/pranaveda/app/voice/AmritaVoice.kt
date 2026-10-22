package com.pranaveda.app.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.pranaveda.app.net.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale

/**
 * Speaks Amrita's reply to a spoken message, as the website does: her
 * ElevenLabs voice through the server's /api/tts when it is configured, the
 * phone's built-in voice otherwise. Replies can be muted; the choice is kept.
 */
class AmritaVoice(
    context: Context,
    private val scope: CoroutineScope,
    private val api: ApiClient = ApiClient(),
) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
    var isMuted by mutableStateOf(prefs.getBoolean(MUTED_KEY, false))
        private set
    /** From asking for the reply until it has been heard ("Hey Amrita" waits meanwhile). */
    var isSpeaking by mutableStateOf(false)
        private set

    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANT)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private var ttsReady = false
    private val tts = TextToSpeech(appContext) { status ->
        if (status == TextToSpeech.SUCCESS) ttsReady = true
    }.apply {
        setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit
            override fun onDone(utteranceId: String?) = finished(utteranceId)
            @Deprecated("Still called on older Android")
            override fun onError(utteranceId: String?) = finished(utteranceId)
            override fun onStop(utteranceId: String?, interrupted: Boolean) = finished(utteranceId)
        })
    }
    private var player: MediaPlayer? = null
    private var current: Job? = null

    fun speak(text: String) {
        stop()
        val words = speakable(text)
        if (isMuted || words.isEmpty()) return
        isSpeaking = true
        current = scope.launch {
            val audio = runCatching { api.speech(words) }.getOrNull()
            if (audio == null) builtIn(words) else runCatching { play(audio) }.onFailure { isSpeaking = false }
        }
    }

    fun stop() {
        current?.cancel()
        current = null
        player?.release()
        player = null
        tts.stop()
        isSpeaking = false
    }

    /** Each built-in reply's id, so a reply that was stopped can't end the next one. */
    private var utterance = 0

    /** Called from the speech engine's thread. */
    private fun finished(utteranceId: String?) {
        scope.launch { if (utteranceId == "amrita-reply-$utterance") isSpeaking = false }
    }

    fun changeMuted(muted: Boolean) {
        isMuted = muted
        prefs.edit().putBoolean(MUTED_KEY, muted).apply()
        if (muted) stop()
    }

    private suspend fun play(audio: ByteArray) {
        val file = withContext(Dispatchers.IO) {
            File(appContext.cacheDir, "amrita-reply.mp3").apply { writeBytes(audio) }
        }
        player = MediaPlayer().apply {
            setAudioAttributes(attributes)
            setDataSource(file.path)
            setOnCompletionListener {
                it.release()
                if (player === it) player = null
                isSpeaking = false
            }
            prepare()
            start()
        }
    }

    private fun builtIn(words: String) {
        if (!ttsReady) {
            isSpeaking = false
            return
        }
        tts.language = Locale.US
        tts.setSpeechRate(0.85f)
        tts.setAudioAttributes(attributes)
        tts.speak(words, TextToSpeech.QUEUE_FLUSH, null, "amrita-reply-${++utterance}")
    }

    companion object {
        const val MUTED_KEY = "pranaveda_voice_muted"

        /** The reply as it should be heard: no markdown marks, list bullets, code, link addresses or pause markers (website: toSpeakable). */
        fun speakable(text: String): String = text
            .replace(Regex("```[\\s\\S]*?```"), " ")
            .replace(Regex("<break[^>]*/>"), " ")
            .replace(Regex("\\[([^\\]]+)\\]\\([^)]*\\)"), "$1")
            .replace(Regex("(?m)^\\s*[-•]\\s+"), "")
            .replace(Regex("[*_#`>]+"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}
