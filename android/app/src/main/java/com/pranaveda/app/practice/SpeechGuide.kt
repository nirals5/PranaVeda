package com.pranaveda.app.practice

import android.content.Context
import android.media.AudioAttributes
import android.speech.tts.TextToSpeech
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.voice.HeyAmrita
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Locale

/**
 * Speaks the guidance with the phone's built-in voice. (The website uses
 * ElevenLabs when it is configured; that comes to the apps with voice.) Each
 * new line replaces whatever was still being said, as on the website.
 */
class SpeechGuide(context: Context) {
    private val prefs = context.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
    private val heyAmrita = (context.applicationContext as? PranaVedaApplication)?.heyAmrita
    var isMuted by mutableStateOf(prefs.getBoolean(MUTED_KEY, false))
        private set

    private var ready = false
    /** A line asked for before the voice was ready; said once it is. */
    private var waiting: String? = null
    private var counter = 0

    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        if (status == TextToSpeech.SUCCESS) {
            ready = true
            configure()
            waiting?.let { speak(it) }
            waiting = null
        }
    }

    private fun configure() {
        tts.language = Locale.US
        tts.setSpeechRate(0.9f)
        // Guidance, not an alarm: plays like spoken media, lowering music while it speaks.
        tts.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
    }

    fun speak(text: String) {
        // Quiet while "Hey Amrita" waits for a command.
        if (isMuted || heyAmrita?.state == HeyAmrita.State.Awake) {
            tts.stop()
            return
        }
        if (!ready) {
            waiting = text
            return
        }
        var queue = TextToSpeech.QUEUE_FLUSH
        for (part in Guidance.script(text)) {
            tts.speak(part.words, queue, null, "pv-${counter++}")
            queue = TextToSpeech.QUEUE_ADD
            if (part.pauseAfter > 0) tts.playSilentUtterance((part.pauseAfter * 1000).toLong(), queue, "pv-${counter++}")
        }
    }

    fun changeMuted(muted: Boolean) {
        isMuted = muted
        prefs.edit().putBoolean(MUTED_KEY, muted).apply()
        if (muted) tts.stop()
    }

    fun stop() {
        waiting = null
        tts.stop()
    }

    /** Call when the screen goes away for good. */
    fun shutdown() {
        tts.stop()
        tts.shutdown()
    }

    private companion object {
        const val MUTED_KEY = "pranaveda_guidance_muted"
    }
}
