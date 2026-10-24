package com.pranaveda.app.voice

/**
 * A request to start listening in the chat — "Hey Amrita", or a widget's
 * "Talk to Amrita" — made at an [android.os.SystemClock.elapsedRealtime] time.
 * It is acted on once: straight away, after Amrita finishes a reply, or not at
 * all once it is stale, so the microphone never starts long after it was asked for.
 */
object VoiceRequest {
    enum class Action { Start, Wait, Drop }

    /** How long a request may wait for a reply to finish. */
    const val TTL_MILLIS = 15_000L

    fun action(requestedAt: Long, now: Long, replying: Boolean): Action = when {
        now - requestedAt > TTL_MILLIS -> Action.Drop
        replying -> Action.Wait
        else -> Action.Start
    }
}
