package com.pranaveda.app.model

import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.CancellationException
import com.pranaveda.app.net.HttpStatusException
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.auth.AccountUser
import com.pranaveda.app.auth.AccountApi
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A bookmarked ritual, in the website's shape (SavedPractice in
 * src/types.ts), so the account's list reads the same on every device.
 */
@Serializable
data class SavedRitual(
    val id: String,
    val title: String,
    /** When it was saved, as shown: "Oct 17". */
    val date: String,
    /** What led to it. The website keeps the request typed before it; here the ritual comes from a conversation. */
    val query: String,
    val category: String,
    val result: RecommendationResult,
)

/**
 * The saved rituals on this phone, newest first, and their sync with the
 * account, following the website (src/hooks/useSavedRituals.ts). Unlike the
 * practice log a ritual can be removed, and a removal travels too.
 *
 * Kept beside the list while signed in:
 *   OWNER_KEY   — whose account this phone's list is synced with.
 *   OWN_KEY     — ids this phone had before sign-in; they stay on sign-out.
 *   SYNCED_KEY  — ids the account is known to have. Anything else is waiting
 *                 to upload, so a ritual saved offline is sent later.
 *   REMOVED_KEY — ids removed here that the account has not heard about yet.
 */
class SavedRitualStore(
    private val file: File,
    private val scope: CoroutineScope,
    private val prefs: SharedPreferences,
    private val api: AccountApi = AccountApi(),
    /** Where the file is written; one write at a time, so saves land in order. */
    private val writer: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1),
) {
    var rituals by mutableStateOf(load())
        private set

    var auth: AuthStore? = null
    private val syncLock = Mutex()
    private var syncAgain = false

    /** The same ritual (every detail alike) counts as saved once. */
    fun isSaved(result: RecommendationResult): Boolean = rituals.any { it.result == result }

    /** Saves the ritual, or removes it if it is already saved. Returns whether it is saved afterwards. */
    fun toggle(result: RecommendationResult, now: Instant = Instant.now()): Boolean {
        if (isSaved(result)) {
            removeSaved(rituals.filter { it.result == result }.map { it.id })
            return false
        }
        val saved = SavedRitual(
            // Like the practice log's ids, unique even for two saves in one millisecond.
            id = "save_${now.toEpochMilli()}_" + (1..5).map { "abcdefghijklmnopqrstuvwxyz0123456789".random() }.joinToString(""),
            title = result.yogaPractice.title,
            date = savedDate(now),
            query = "Conversation with Amrita",
            category = "Yoga",
            result = result,
        )
        store(listOf(saved) + rituals)
        if (auth?.isSignedIn == true) scope.launch { sync() }
        return true
    }

    fun remove(ritual: SavedRitual) = removeSaved(listOf(ritual.id))

    private fun removeSaved(ids: List<String>) {
        store(rituals.filter { it.id !in ids })
        // Only the account needs telling, and only once this phone syncs with one.
        if (prefs.getString(OWNER_KEY, null) == null) return
        prefs.edit().putStringSet(REMOVED_KEY, prefs.getStringSet(REMOVED_KEY, emptySet()).orEmpty() + ids).apply()
        if (auth?.isSignedIn == true) scope.launch { sync() }
    }

    // The account

    /**
     * After sign-in (and once per launch for a restored session): the first
     * time for this account, this phone's rituals are remembered as its own;
     * then everything is synced.
     */
    suspend fun adoptAccount(user: AccountUser) {
        if (prefs.getString(OWNER_KEY, null) != user.id) {
            prefs.edit()
                .putStringSet(OWN_KEY, rituals.map { it.id }.toSet())
                .putStringSet(SYNCED_KEY, emptySet())
                .putStringSet(REMOVED_KEY, emptySet())
                .putString(OWNER_KEY, user.id)
                .apply()
        }
        sync()
    }

    /** After sign-out (by any route): this phone's own rituals stay, the ones from the account leave. One that never reached the account is kept. */
    fun handBackDevice() {
        if (prefs.getString(OWNER_KEY, null) == null) return
        val own = prefs.getStringSet(OWN_KEY, emptySet()).orEmpty()
        val synced = prefs.getStringSet(SYNCED_KEY, emptySet()).orEmpty()
        store(rituals.filter { it.id in own || it.id !in synced })
        prefs.edit().remove(OWNER_KEY).remove(OWN_KEY).remove(SYNCED_KEY).remove(REMOVED_KEY).apply()
    }

    /** Sends what was removed and saved here, then takes the account's list. One run at a time; a request during a run starts another. */
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
        var removes = prefs.getStringSet(REMOVED_KEY, emptySet()).orEmpty().toList()
        while (removes.isNotEmpty()) {
            val batch = removes.take(REMOVE_BATCH)
            withToken { api.sendSavedChanges(emptyList(), batch, it) } ?: return false
            removes = removes.drop(batch.size)
            prefs.edit().putStringSet(REMOVED_KEY, removes.toSet()).apply()
        }

        val synced = prefs.getStringSet(SYNCED_KEY, emptySet()).orEmpty().toMutableSet()
        for (batch in rituals.filter { it.id !in synced }.chunked(SAVE_BATCH)) {
            withToken { api.sendSavedChanges(batch, emptyList(), it) } ?: return false
            synced += batch.map { it.id }
            prefs.edit().putStringSet(SYNCED_KEY, synced.toSet()).apply()
        }

        val account = withToken { api.savedRituals(it) } ?: return false
        val merged = reconcile(rituals, account, synced, prefs.getStringSet(REMOVED_KEY, emptySet()).orEmpty())
        store(merged.first)
        prefs.edit().putStringSet(SYNCED_KEY, merged.second.toSet()).apply()
        return true
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

    private fun store(value: List<SavedRitual>) {
        rituals = value
        val json = PvJson.encodeToString(ListSerializer(SavedRitual.serializer()), value)
        scope.launch(writer) {
            runCatching {
                val temp = File(file.parentFile, file.name + ".tmp")
                temp.writeText(json)
                temp.renameTo(file)
            }
        }
    }

    private fun load(): List<SavedRitual> =
        runCatching { PvJson.decodeFromString(ListSerializer(SavedRitual.serializer()), file.readText()) }.getOrDefault(emptyList())

    companion object {
        /** The server's per-request limits. */
        const val SAVE_BATCH = 25
        const val REMOVE_BATCH = 100
        private const val OWNER_KEY = "pranaveda_saved_owner"
        private const val OWN_KEY = "pranaveda_saved_own_ids"
        private const val SYNCED_KEY = "pranaveda_saved_synced_ids"
        private const val REMOVED_KEY = "pranaveda_saved_removed_ids"

        /**
         * How this phone's list and the account's come together (the website's
         * reconcileSaved): a ritual the account no longer has, that this phone
         * knew it had, was removed elsewhere; one the account has and this phone
         * does not (and did not just remove) was saved elsewhere. Anything not
         * yet synced stays. Newest first; returns the list and the synced ids.
         */
        fun reconcile(local: List<SavedRitual>, account: List<SavedRitual>, synced: Set<String>, pendingRemoves: Set<String>): Pair<List<SavedRitual>, List<String>> {
            val accountIds = account.map { it.id }.toSet()
            val kept = local.filter { !(it.id in synced && it.id !in accountIds) }
            val keptIds = kept.map { it.id }.toSet()
            val arrived = account.filter { it.id !in keptIds && it.id !in pendingRemoves }
            val rituals = (arrived + kept).sortedByDescending { savedMillis(it.id) } // stable: ties keep their order
            return rituals to (accountIds - pendingRemoves).sorted()
        }

        /** When a ritual was saved, from its id ("save_1760000000000_ab12c"). 0 if unknown. */
        fun savedMillis(id: String): Long = Regex("_(\\d{12,})").find(id)?.groupValues?.get(1)?.toLongOrNull() ?: 0

        /** "Oct 17", as the website writes it. */
        fun savedDate(at: Instant, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String =
            DateTimeFormatter.ofPattern("MMM d", locale).format(at.atZone(zone))
    }
}
