package com.pranaveda.app.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Listens for one spoken message with the phone's own speech recognition,
 * showing the words as they are heard (the website's voice consultation).
 * Recognition stays on the phone when it supports that. Use from the main
 * thread; call [release] when the screen goes away.
 */
class VoiceListener(private val context: Context) {
    enum class State { Idle, Listening, NotAllowed, Unavailable }

    var state by mutableStateOf(State.Idle)
        private set
    var transcript by mutableStateOf("")
        private set

    private var recognizer: SpeechRecognizer? = null

    fun start() {
        release()
        transcript = ""
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            state = State.Unavailable
            return
        }
        val recognizer = SpeechRecognizer.createSpeechRecognizer(context).also { this.recognizer = it }
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { state = State.Listening }
            override fun onPartialResults(partialResults: Bundle?) = take(partialResults)
            override fun onResults(results: Bundle?) {
                take(results)
                state = State.Idle
            }
            override fun onError(error: Int) {
                state = when {
                    error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> State.NotAllowed
                    // Silence or nothing recognised: keep whatever was heard.
                    error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> State.Idle
                    transcript.isNotBlank() -> State.Idle
                    else -> State.Unavailable
                }
            }
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
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
                // A thoughtful pause should not end the message.
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L),
        )
        state = State.Listening
    }

    /** The microphone permission was refused. */
    fun notAllowed() {
        release()
        state = State.NotAllowed
    }

    /** Stops listening and keeps the words heard so far. */
    fun stop() {
        recognizer?.stopListening()
        if (state == State.Listening) state = State.Idle
    }

    fun release() {
        recognizer?.destroy()
        recognizer = null
        if (state == State.Listening) state = State.Idle
    }

    private fun take(bundle: Bundle?) {
        val heard = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        if (!heard.isNullOrBlank()) transcript = heard
    }
}
