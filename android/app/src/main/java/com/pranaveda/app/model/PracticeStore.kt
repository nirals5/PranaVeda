package com.pranaveda.app.model

import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AccountUser
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.net.HttpStatusException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/**
 * The practice log on this phone, and its sync with the account, following
 * the website (src/hooks/usePracticeLog.ts and usePracticeSync.ts).
 *
 * Kept beside the log while signed in:
 *   OWNER_KEY  — whose account this phone's log is synced with.
 *   OWN_KEY    — ids of the practices this phone had before sign-in; they stay
 *                when the person signs out.
 *   SYNCED_KEY — ids the account is known to have. Anything else is waiting to
 *                upload, so a practice finished offline is sent later.
 *   CURSOR_KEY — how far through the account's log this phone has read.
 */
class PracticeStore(
    private val api: AccountApi,
    private val prefs: SharedPreferences,
    private val file: File,
    private val scope: CoroutineScope,
    /** Where the log file is written; one write at a time, so saves land in order. */
    private val writer: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1),
) {
    /** Oldest first. */
    var entries by mutableStateOf(load())
        private set

    val streak: Int get() = PracticeLog.streak(entries)

    var auth: AuthStore? = null

    private val syncLock = Mutex()
    private var syncAgain = false

    /** Records a finished practice, and sends it to the account when signed in. */
    fun log(kind: PracticeLogEntry.Kind, title: String, durationMinutes: Int, result: RecommendationResult?): PracticeLogEntry {
        val entry = PracticeLog.newEntry(kind, title, durationMinutes, result)
        storeEntries(PracticeLog.trimmed(entries + entry))
        if (auth?.isSignedIn == true) scope.launch { sync() }
        return entry
    }

    /**
     * After sign-in (and once per launch for a restored session): the first
     * time for this account, this phone's practices are remembered as its own;
     * then everything is synced.
     */
    suspend fun adoptAccount(user: AccountUser) {
        if (prefs.getString(OWNER_KEY, null) != user.id) {
            prefs.edit()
                .putStringSet(OWN_KEY, entries.map { it.id }.toSet())
                .putStringSet(SYNCED_KEY, emptySet())
                .putLong(CURSOR_KEY, 0)
                .putString(OWNER_KEY, user.id)
                .apply()
        }
        sync()
    }

    /**
     * After sign-out (by any route): this phone's own practices stay, the ones
     * that came from the account leave. One that never reached the account is
     * kept rather than lost.
     */
    fun handBackDevice() {
        if (prefs.getString(OWNER_KEY, null) == null) return
        val own = prefs.getStringSet(OWN_KEY, emptySet()).orEmpty()
        val synced = prefs.getStringSet(SYNCED_KEY, emptySet()).orEmpty()
        storeEntries(entries.filter { it.id in own || it.id !in synced })
        prefs.edit().remove(OWNER_KEY).remove(OWN_KEY).remove(SYNCED_KEY).remove(CURSOR_KEY).apply()
    }

    /**
     * Uploads whatever the account does not have yet, then reads whatever is
     * new there. One run at a time; a request during a run starts another.
     */
    suspend fun sync() {
        if (prefs.getString(OWNER_KEY, null) == null) return
        if (syncLock.isLocked) {
            syncAgain = true
            return
        }
        syncLock.withLock {
            do {
                syncAgain = false
                if (!syncOnce()) return // offline or refused: tried again next time
            } while (syncAgain)
        }
    }

    private suspend fun syncOnce(): Boolean {
        val synced = prefs.getStringSet(SYNCED_KEY, emptySet()).orEmpty().toMutableSet()
        val pending = entries.filter { it.id !in synced }
        for (batch in pending.chunked(BATCH_SIZE)) {
            withToken { api.uploadPractices(batch, it) } ?: return false
            synced += batch.map { it.id }
            prefs.edit().putStringSet(SYNCED_KEY, synced.toSet()).apply()
        }

        var cursor = prefs.getLong(CURSOR_KEY, 0)
        while (true) {
            val after = cursor
            val page = withToken { api.practicesAfter(after, it) } ?: return false
            if (page.entries.isNotEmpty()) {
                storeEntries(PracticeLog.merged(entries, page.entries))
                synced += page.entries.map { it.id }
                prefs.edit().putStringSet(SYNCED_KEY, synced.toSet()).apply()
            }
            cursor = page.cursor
            prefs.edit().putLong(CURSOR_KEY, cursor).apply()
            if (!page.hasMore) return true
        }
    }

    /** Runs a request as the signed-in person, refreshing once if the sign-in had expired. Null when signed out, offline or refused. */
    private suspend fun <T> withToken(request: suspend (String) -> T): T? {
        val auth = auth ?: return null
        val token = auth.validAccessToken() ?: return null
        return try {
            request(token)
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpStatusException) {
            if (e.status != 401) return null
            val fresh = auth.tokenAfterRejection() ?: return null
            runCatching { request(fresh) }.getOrNull()
        } catch (e: Exception) {
            null
        }
    }

    private fun storeEntries(value: List<PracticeLogEntry>) {
        entries = value
        val json = PvJson.encodeToString(ListSerializer(PracticeLogEntry.serializer()), value)
        scope.launch(writer) {
            runCatching {
                val temp = File(file.parentFile, file.name + ".tmp")
                temp.writeText(json)
                temp.renameTo(file)
            }
        }
    }

    private fun load(): List<PracticeLogEntry> =
        runCatching { PvJson.decodeFromString(ListSerializer(PracticeLogEntry.serializer()), file.readText()) }.getOrDefault(emptyList())

    companion object {
        /** The server's per-request limit. */
        const val BATCH_SIZE = 25
        private const val OWNER_KEY = "pranaveda_practice_owner"
        private const val OWN_KEY = "pranaveda_practice_own_ids"
        private const val SYNCED_KEY = "pranaveda_practice_synced_ids"
        private const val CURSOR_KEY = "pranaveda_practice_cursor"
    }
}
