package com.pranaveda.app.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Listens for one spoken message with the phone's own speech recognition,
 * keeping the words heard so far and how loud the voice is, for the chat's
 * recording bar. Recognition stays on the phone when it supports that.
 *
 * Android's recognizer ends each session at a pause; while the bar is open it
 * starts another and keeps the earlier words, so recording lasts until send
 * or cancel. Use from the main thread; call [release] when done.
 */
class VoiceListener(private val context: Context) {
    enum class State { Idle, Listening, NotAllowed, Unavailable }

    var state by mutableStateOf(State.Idle)
        private set
    /** Everything heard so far: finished sessions plus the one in progress. */
    val transcript: String get() = join(committed, partial)
    /** Recent loudness, 0 (silence) to 1, oldest first: the recording bar's waves. */
    var levels by mutableStateOf(List(WAVE_COUNT) { 0f })
        private set
    /** When listening began (elapsed-realtime ms), for the recording bar's clock. */
    var startedAt by mutableLongStateOf(0L)
        private set

    private var committed by mutableStateOf("")
    private var partial by mutableStateOf("")
    private var recognizer: SpeechRecognizer? = null
    private var active = false
    private var failures = 0

    fun start() {
        release()
        committed = ""
        partial = ""
        levels = List(WAVE_COUNT) { 0f }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            state = State.Unavailable
            return
        }
        active = true
        failures = 0
        startedAt = android.os.SystemClock.elapsedRealtime()
        state = State.Listening
        listen()
    }

    /** The microphone permission was refused. */
    fun notAllowed() {
        release()
        state = State.NotAllowed
    }

    /** Stops listening for good and keeps the words heard so far. */
    fun release() {
        active = false
        recognizer?.destroy()
        recognizer = null
        if (state == State.Listening) state = State.Idle
        committed = transcript
        partial = ""
    }

    private fun listen() {
        recognizer?.destroy()
        val recognizer = SpeechRecognizer.createSpeechRecognizer(context).also { this.recognizer = it }
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onRmsChanged(rmsdB: Float) {
                levels = levels.drop(1) + normalizedLevel(rmsdB)
            }
            override fun onPartialResults(partialResults: Bundle?) {
                first(partialResults)?.let { partial = it }
            }
            override fun onResults(results: Bundle?) {
                committed = join(committed, first(results) ?: partial)
                partial = ""
                failures = 0
                continueListening()
            }
            override fun onError(error: Int) {
                when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> notAllowed()
                    // A pause with nothing new to hear: keep going.
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                        committed = transcript
                        partial = ""
                        continueListening()
                    }
                    else -> {
                        committed = transcript
                        partial = ""
                        // A busy or flaky recognizer gets a couple of tries before giving up.
                        if (++failures <= 2) continueListening() else stopWith(if (transcript.isBlank()) State.Unavailable else State.Idle)
                    }
                }
            }
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })
        recognizer.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L),
        )
    }

    private fun continueListening() {
        if (active) listen()
    }

    private fun stopWith(next: State) {
        active = false
        recognizer?.destroy()
        recognizer = null
        state = next
    }

    private fun first(bundle: Bundle?): String? =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }

    companion object {
        const val WAVE_COUNT = 28

        /** The recognizer's loudness (about -2 dB in silence to 10 dB speaking up) as a wave height, 0 to 1. */
        fun normalizedLevel(rmsdB: Float): Float = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)

        /** Sessions' words joined into one message. */
        fun join(before: String, next: String): String = listOf(before.trim(), next.trim()).filter { it.isNotEmpty() }.joinToString(" ")
    }
}
