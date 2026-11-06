package com.pranaveda.app.practice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaDataSource
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.voice.HeyAmrita
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Speaks the guidance in Amrita's voice, as the website does: her ElevenLabs
 * voice through the server's /api/tts, the phone's built-in voice when that
 * isn't configured or can't be reached. Each new line replaces whatever was
 * still being said. Lines can be fetched ahead (breath cues, the next pose)
 * so they start on time.
 */
class SpeechGuide(context: Context, api: ApiClient = ApiClient()) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
    private val heyAmrita = (appContext as? PranaVedaApplication)?.heyAmrita
    var isMuted by mutableStateOf(prefs.getBoolean(MUTED_KEY, false))
        private set

    private val scope = MainScope()
    private val voice = GuidanceAudio(scope) { api.speech(it, timeoutSeconds = 10) }
    private var current: Job? = null
    private var player: MediaPlayer? = null

    // Guidance, not an alarm: plays like spoken media, lowering music while it speaks.
    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private val audioManager = appContext.getSystemService(AudioManager::class.java)
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributes)
        .build()

    private var ready = false
    /** A line asked for before the built-in voice was ready; said once it is. */
    private var waiting: String? = null

    /** Paused with the practice: what was being said waits, and so does a new line (Back or Next while paused) until Play. */
    private var isPaused = false
    private var queued: String? = null

    // The built-in voice can't pause; it stops, and Play says the rest from
    // the sentence it was on. Ids are "pv-<line>-<part>".
    @Volatile private var line = 0
    private var parts: List<Guidance.Part> = emptyList()
    @Volatile private var partIndex = 0
    @Volatile private var lastId: String? = null
    private var resumeFrom: Int? = null

    private val tts: TextToSpeech = TextToSpeech(appContext) { status ->
        if (status == TextToSpeech.SUCCESS) {
            ready = true
            configure()
            waiting?.let { builtIn(it) }
            waiting = null
        }
    }.apply {
        setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            // Called on the speech engine's thread.
            override fun onStart(utteranceId: String?) {
                val numbers = utteranceId?.removePrefix("pv-")?.split("-")?.mapNotNull { it.toIntOrNull() } ?: return
                if (numbers.size < 2 || numbers[0] != line) return
                // In the silence after a sentence, Play goes on to the next one.
                partIndex = if (utteranceId.endsWith("-pause")) numbers[1] + 1 else numbers[1]
            }
            override fun onDone(utteranceId: String?) {
                if (utteranceId == null || utteranceId != lastId) return
                scope.launch { if (utteranceId == lastId && !isPaused) parts = emptyList() }
            }
            @Deprecated("Still called on older Android")
            override fun onError(utteranceId: String?) = Unit
        })
    }

    private fun configure() {
        tts.language = Locale.US
        tts.setSpeechRate(0.9f)
        tts.setAudioAttributes(attributes)
    }

    fun speak(text: String) {
        stopSpeaking()
        // Quiet while "Hey Amrita" waits for a command.
        if (quiet()) return
        if (isPaused) {
            queued = text
            prefetch(listOf(text))
            return
        }
        current = scope.launch {
            val audio = voice.audio(text)
            if (quiet()) return@launch
            if (isPaused) {
                queued = text // paused while it was being fetched
                return@launch
            }
            if (audio == null || !play(audio)) builtIn(text)
        }
    }

    /** With the practice's pause. */
    fun pause() {
        if (isPaused) return
        isPaused = true
        player?.takeIf { it.isPlaying }?.pause()
        if (parts.isNotEmpty() && partIndex < parts.size) {
            resumeFrom = partIndex
            tts.stop()
        }
    }

    fun resume() {
        if (!isPaused) return
        isPaused = false
        val pending = queued
        val from = resumeFrom
        queued = null
        resumeFrom = null
        when {
            pending != null -> speak(pending)
            player != null -> {
                audioManager?.requestAudioFocus(focus)
                player?.start()
            }
            from != null -> speakParts(from)
        }
    }

    /** Fetches lines that are coming up, in order, so they play without delay. */
    fun prefetch(texts: List<String>) {
        if (!isMuted) voice.prefetch(texts)
    }

    fun changeMuted(muted: Boolean) {
        isMuted = muted
        prefs.edit().putBoolean(MUTED_KEY, muted).apply()
        if (muted) stopSpeaking()
    }

    fun stop() {
        waiting = null
        stopSpeaking()
    }

    /** Call when the screen goes away for good. */
    fun shutdown() {
        stopSpeaking()
        scope.cancel()
        tts.shutdown()
    }

    private fun quiet() = isMuted || heyAmrita?.state == HeyAmrita.State.Awake

    private fun stopSpeaking() {
        queued = null
        resumeFrom = null
        parts = emptyList()
        current?.cancel()
        current = null
        releasePlayer()
        tts.stop()
    }

    /** Her voice, from memory; false if the clip can't be played. */
    private fun play(audio: ByteArray): Boolean = runCatching {
        val next = MediaPlayer().apply {
            setAudioAttributes(attributes)
            setDataSource(Clip(audio))
            setOnCompletionListener { done -> if (player === done) releasePlayer() else done.release() }
            prepare()
        }
        player = next
        audioManager?.requestAudioFocus(focus)
        next.start()
        true
    }.getOrElse {
        releasePlayer()
        false
    }

    private fun releasePlayer() {
        player?.release()
        player = null
        audioManager?.abandonAudioFocusRequest(focus)
    }

    /** The built-in voice, with the pause markers turned into silences. */
    private fun builtIn(text: String) {
        if (!ready) {
            waiting = text
            return
        }
        line++
        parts = Guidance.script(text)
        speakParts(0)
    }

    private fun speakParts(from: Int) {
        partIndex = from
        var queue = TextToSpeech.QUEUE_FLUSH
        for (index in from until parts.size) {
            val part = parts[index]
            lastId = "pv-$line-$index"
            tts.speak(part.words, queue, null, lastId)
            queue = TextToSpeech.QUEUE_ADD
            if (part.pauseAfter > 0) {
                lastId = "pv-$line-$index-pause"
                tts.playSilentUtterance((part.pauseAfter * 1000).toLong(), queue, lastId)
            }
        }
    }

    /** An MP3 held in memory, so no file is shared between lines. */
    private class Clip(private val data: ByteArray) : MediaDataSource() {
        override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
            if (position >= data.size) return -1
            val count = minOf(size, data.size - position.toInt())
            System.arraycopy(data, position.toInt(), buffer, offset, count)
            return count
        }

        override fun getSize(): Long = data.size.toLong()
        override fun close() = Unit
    }

    private companion object {
        const val MUTED_KEY = "pranaveda_guidance_muted"
    }
}
