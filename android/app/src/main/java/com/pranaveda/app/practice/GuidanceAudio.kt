package com.pranaveda.app.practice

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.launch

/**
 * Amrita's voice for the guidance, as on the website: each line asked of the
 * server once and kept, lines coming up fetched ahead one at a time (bursts
 * trip ElevenLabs' throttling). Once her voice can't be had (none configured,
 * or twice unreachable) the rest of the practice is said in the built-in voice
 * without waiting. Use from one thread (the main one).
 */
class GuidanceAudio(
    private val scope: CoroutineScope,
    private val fetch: suspend (String) -> ByteArray?,
) {
    private val cache = HashMap<String, ByteArray>()
    private val loading = HashMap<String, Deferred<ByteArray?>>()
    private var failures = 0
    private var ahead: Job? = null

    var builtInOnly = false
        private set

    /** Her voice saying [text], or null when the built-in voice should say it. */
    suspend fun audio(text: String): ByteArray? {
        cache[text]?.let { return it }
        loading[text]?.let { return it.await() }
        if (builtInOnly) return null
        val pending = scope.async { load(text) }
        loading[text] = pending
        return try {
            pending.await()
        } finally {
            loading.remove(text)
        }
    }

    /** Fetches lines that are coming up, in order, so they play without delay. */
    fun prefetch(texts: List<String>): Job {
        val previous = ahead
        return scope.launch {
            previous?.join()
            for (text in texts) if (text.isNotEmpty()) audio(text)
        }.also { ahead = it }
    }

    private suspend fun load(text: String): ByteArray? = try {
        val data = fetch(text)
        if (data == null) {
            builtInOnly = true // the server has no voice configured
            null
        } else {
            failures = 0
            cache[text] = data
            data
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        if (++failures >= 2) builtInOnly = true
        null
    }
}
