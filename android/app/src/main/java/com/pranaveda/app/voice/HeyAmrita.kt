package com.pranaveda.app.voice

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.ToneGenerator
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import androidx.annotation.RequiresApi
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import java.io.FileDescriptor
import java.util.concurrent.atomic.AtomicReference

/**
 * "Hey Amrita" while the app is open, an opt-in. On the Amrita tab it opens
 * the recording bar, as the Talk to Amrita button does; during a guided
 * practice it takes a spoken command ("Hey Amrita, pause"). It listens only
 * while one of those is on screen and the app is in front, never in Battery
 * Saver, and recognition runs on the phone: no audio or words leave it.
 *
 * The app records the microphone itself with the phone's echo cancellation,
 * so its own voice (the guidance) is taken out of what is heard, and hands
 * that audio to the on-device recognizer. That needs Android 13; older phones
 * don't offer it. Use from the main thread.
 */
class HeyAmrita(context: Context) {
    enum class State {
        Off,
        Listening,
        /** Heard "Hey Amrita" in a practice: waiting a moment for the command. */
        Awake,
        /** The microphone permission was refused. */
        NotAllowed,
        /** No on-device recognition on this phone (or Android older than 13). */
        Unavailable,
    }

    /** Reasons to stop listening for a while. */
    enum class Hold {
        /** The recording bar has the microphone. */
        Recording,
        /** Amrita is reading a reply aloud. */
        Replying,
        /** The app isn't in front. */
        Background,
    }

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
    private val power = appContext.getSystemService(PowerManager::class.java)
    private val main = Handler(Looper.getMainLooper())

    var isEnabled by mutableStateOf(prefs.getBoolean(ENABLED_KEY, false))
        private set
    var state by mutableStateOf(State.Off)
        private set
    val isListening: Boolean get() = state == State.Listening || state == State.Awake

    /**
     * The open practice's controls: while set, commands go there. Null is a
     * bare "Hey Amrita": the practice should fall quiet for the command.
     */
    var practiceCommands: ((WakePhrase.Command?) -> Unit)? = null
        set(value) {
            field = value
            refresh()
        }

    /** "Hey Amrita" outside a practice: open the chat listening. */
    var onWake: () -> Unit = {}

    /** The Amrita tab is on screen, set by the app. */
    var chatShowing = false
        set(value) {
            if (field != value) {
                field = value
                refresh()
            }
        }

    private val holds = mutableSetOf<Hold>()
    private var recognizer: SpeechRecognizer? = null
    private var record: AudioRecord? = null
    private var pump: MicPump? = null
    private var reading: ParcelFileDescriptor? = null
    /** Bumped with each recognition session, so a stale callback is ignored. */
    private var generation = 0
    private var sessionStarted = 0L
    private var awakeUntil = 0L
    private var failures = 0
    private var running = false

    init {
        ContextCompat.registerReceiver(
            appContext,
            object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) = refresh()
            },
            IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    fun changeEnabled(on: Boolean) {
        isEnabled = on
        prefs.edit().putBoolean(ENABLED_KEY, on).apply()
        if (!on) state = State.Off
        refresh()
    }

    /** Listen again after a wake the app did not act on (a stale "Hey Amrita" request). */
    fun resume() = refresh()

    fun hold(reason: Hold, on: Boolean) {
        val changed = if (on) holds.add(reason) else holds.remove(reason)
        if (changed) refresh()
    }

    private val shouldListen: Boolean
        get() = isEnabled && holds.isEmpty() && power?.isPowerSaveMode != true && (practiceCommands != null || chatShowing)

    private fun refresh() {
        if (!shouldListen) stop() else if (!running) start()
    }

    @SuppressLint("MissingPermission") // checked just below
    private fun start() {
        if (Build.VERSION.SDK_INT < 33 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(appContext)) {
            state = State.Unavailable
            return
        }
        if (appContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            state = State.NotAllowed
            return
        }
        // The voice-call microphone: the phone's echo cancellation and noise
        // suppression, for a voice across the room over the guidance.
        val record = runCatching {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                maxOf(AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), CHUNK * 4),
            )
        }.getOrNull()?.takeIf { it.state == AudioRecord.STATE_INITIALIZED }
        if (record == null) return // the microphone is busy (a call): tried again on the next change
        if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(record.audioSessionId)?.enabled = true
        if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(record.audioSessionId)?.enabled = true
        runCatching { record.startRecording() }.onFailure {
            record.release()
            return
        }
        this.record = record
        pump = MicPump(record).also { it.start() }
        recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(appContext)
        running = true
        failures = 0
        state = State.Listening
        listenAfresh()
        main.postDelayed(tick, 1000)
    }

    private fun stop() {
        main.removeCallbacks(tick)
        generation++
        recognizer?.cancel()
        recognizer?.destroy()
        recognizer = null
        pump?.finish()
        pump = null
        record?.let { runCatching { it.stop() }; it.release() }
        record = null
        reading?.close()
        reading = null
        running = false
        if (isListening) state = State.Off
    }

    /**
     * A fresh recognition session on the same microphone: after each command,
     * when the recognizer ends a session, and every 50 seconds, so old words
     * are never heard twice.
     */
    @RequiresApi(33)
    private fun listenAfresh() {
        val recognizer = recognizer ?: return
        val current = ++generation
        recognizer.cancel()
        val (read, write) = ParcelFileDescriptor.createPipe()
        // Never block the microphone thread: audio the recognizer hasn't taken is dropped.
        runCatching { Os.fcntlInt(write.fileDescriptor, OsConstants.F_SETFL, OsConstants.O_NONBLOCK) }
        pump?.target?.getAndSet(write)?.close()
        reading?.close()
        reading = read
        sessionStarted = SystemClock.elapsedRealtime()
        recognizer.setRecognitionListener(Session(current))
        recognizer.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, read)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                .putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, SAMPLE_RATE)
                // One session for as long as the audio flows, rather than one per pause.
                .putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
                .putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, BIASING),
        )
    }

    private val tick: Runnable = object : Runnable {
        override fun run() {
            if (!running) return
            val now = SystemClock.elapsedRealtime()
            if (state == State.Awake && now > awakeUntil) {
                state = State.Listening
                if (Build.VERSION.SDK_INT >= 33) listenAfresh()
            } else if (state == State.Listening && now - sessionStarted > 50_000) {
                if (Build.VERSION.SDK_INT >= 33) listenAfresh()
            }
            main.postDelayed(this, 1000)
        }
    }

    /** [readings] are the recognizer's guesses at the words so far, best first: a wake phrase or command in any counts. */
    @RequiresApi(33)
    private fun heard(readings: List<String>) {
        val practice = practiceCommands
        if (state == State.Awake && practice != null) {
            readings.firstNotNullOfOrNull(WakePhrase::command)?.let { command ->
                state = State.Listening
                listenAfresh()
                practice(command)
                return
            }
        }
        val match = readings.firstNotNullOfOrNull(WakePhrase::match) ?: return
        if (practice == null) {
            stop()
            onWake()
            return
        }
        val command = match.command
        if (command != null) {
            state = State.Listening
            listenAfresh()
            practice(command)
        } else {
            // A chime, the practice falls quiet, and the next words are the command.
            state = State.Awake
            awakeUntil = SystemClock.elapsedRealtime() + AWAKE_MILLIS
            runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 80).startTone(ToneGenerator.TONE_PROP_ACK, 150) }
            practice(null)
            listenAfresh()
        }
    }

    @RequiresApi(33)
    private inner class Session(private val id: Int) : RecognitionListener {
        private val current get() = running && id == generation

        override fun onPartialResults(partialResults: Bundle?) {
            if (current) heard(readings(partialResults))
        }

        override fun onSegmentResults(segmentResults: Bundle) {
            if (current) heard(readings(segmentResults))
        }

        override fun onResults(results: Bundle?) {
            if (!current) return
            heard(readings(results))
            if (current) listenAfresh()
        }

        override fun onEndOfSegmentedSession() {
            if (current) listenAfresh()
        }

        override fun onError(error: Int) {
            if (!current) return
            when (error) {
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    stop()
                    state = State.NotAllowed
                }
                SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> {
                    stop()
                    state = State.Unavailable
                }
                // A quiet stretch or a hiccup: start again, a little later if it keeps failing.
                else -> {
                    failures++
                    main.postDelayed({ if (current) listenAfresh() }, if (failures > 3) 2000L else 0L)
                }
            }
        }

        override fun onReadyForSpeech(params: Bundle?) {
            failures = 0
        }

        override fun onBeginningOfSpeech() = Unit
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit
    }

    private fun readings(bundle: Bundle?): List<String> =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.filter { it.isNotBlank() }.orEmpty()

    /** Copies the microphone into whichever session's pipe is current, off the main thread. */
    private class MicPump(private val record: AudioRecord) : Thread("hey-amrita-mic") {
        val target = AtomicReference<ParcelFileDescriptor?>(null)
        @Volatile private var going = true

        override fun run() {
            val buffer = ByteArray(CHUNK)
            while (going) {
                val count = record.read(buffer, 0, buffer.size)
                val out = target.get() ?: continue
                if (count > 0) write(out.fileDescriptor, buffer, count)
            }
        }

        private fun write(fd: FileDescriptor, buffer: ByteArray, count: Int) {
            try {
                Os.write(fd, buffer, 0, count)
            } catch (_: ErrnoException) {
                // Full (the recognizer is behind) or closed (a new session): drop this chunk.
            }
        }

        fun finish() {
            going = false
            target.getAndSet(null)?.close()
        }
    }

    companion object {
        const val ENABLED_KEY = "pranaveda_hey_amrita"
        /** How long Amrita waits for the command after a bare "Hey Amrita". */
        const val AWAKE_MILLIS = 6_000L
        private const val SAMPLE_RATE = 16_000
        /** 100 ms of 16-bit mono audio. */
        private const val CHUNK = SAMPLE_RATE / 10 * 2
        private val BIASING = arrayListOf("Hey Amrita", "Amrita", "pause", "resume", "next", "back", "end")
    }
}
