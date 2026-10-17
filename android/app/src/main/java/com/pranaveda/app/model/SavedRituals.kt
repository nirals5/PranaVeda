package com.pranaveda.app.model

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
 * src/types.ts). Like the website's, the list stays on this device: it is
 * not part of the account.
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

/** The saved rituals on this phone, newest first. */
class SavedRitualStore(
    private val file: File,
    private val scope: CoroutineScope,
    /** Where the file is written; one write at a time, so saves land in order. */
    private val writer: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1),
) {
    var rituals by mutableStateOf(load())
        private set

    /** The same ritual (every detail alike) counts as saved once. */
    fun isSaved(result: RecommendationResult): Boolean = rituals.any { it.result == result }

    /** Saves the ritual, or removes it if it is already saved. Returns whether it is saved afterwards. */
    fun toggle(result: RecommendationResult, now: Instant = Instant.now()): Boolean {
        if (isSaved(result)) {
            store(rituals.filter { it.result != result })
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
        return true
    }

    fun remove(ritual: SavedRitual) = store(rituals.filter { it.id != ritual.id })

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
        /** "Oct 17", as the website writes it. */
        fun savedDate(at: Instant, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String =
            DateTimeFormatter.ofPattern("MMM d", locale).format(at.atZone(zone))
    }
}
