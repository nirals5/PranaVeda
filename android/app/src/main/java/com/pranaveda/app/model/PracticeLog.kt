package com.pranaveda.app.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.random.Random

/**
 * One finished practice, as the website records it (PracticeLogEntry in
 * src/types.ts), so the account's log reads the same on every device.
 */
@Serializable
data class PracticeLogEntry(
    val id: String,
    val kind: Kind,
    val title: String,
    /** ISO 8601 timestamp. */
    val completedAt: String,
    /** "YYYY-MM-DD" in the person's own timezone: the calendar key. */
    val localDate: String,
    val durationMinutes: Int,
    /**
     * The ritual as it was shown, so the day can reopen it. Only the newest
     * entries keep theirs; a ritual this app cannot read is dropped rather
     * than the entry.
     */
    @Serializable(with = LenientRitualSerializer::class)
    val result: RecommendationResult? = null,
) {
    @Serializable
    enum class Kind {
        @kotlinx.serialization.SerialName("ritual")
        Ritual,

        @kotlinx.serialization.SerialName("breathwork")
        Breathwork,
    }

    val completedInstant: Instant? get() = runCatching { Instant.parse(completedAt) }.getOrNull()
}

/** Reads a ritual snapshot if it can; otherwise none, keeping the entry. */
object LenientRitualSerializer : KSerializer<RecommendationResult?> {
    private val inner = RecommendationResult.serializer()
    override val descriptor: SerialDescriptor = inner.descriptor.nullable

    override fun deserialize(decoder: Decoder): RecommendationResult? {
        val element: JsonElement = (decoder as JsonDecoder).decodeJsonElement()
        return runCatching { PvJson.decodeFromJsonElement(inner, element) }.getOrNull()
    }

    override fun serialize(encoder: Encoder, value: RecommendationResult?) {
        if (value == null) encoder.encodeNull() else encoder.encodeSerializableValue(inner, value)
    }
}

/** The rules of the practice log, shared with the website (src/hooks/usePracticeLog.ts). */
object PracticeLog {
    const val MAX_ENTRIES = 500

    /** Ritual snapshots are a few KB each; only the newest entries keep theirs. */
    const val MAX_SNAPSHOTS = 40

    private val ISO_MILLIS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneId.of("UTC"))

    /** A new entry, finished now. Ids look like the website's ("p_<ms>_<5 chars>"). */
    fun newEntry(
        kind: PracticeLogEntry.Kind,
        title: String,
        durationMinutes: Int,
        result: RecommendationResult?,
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): PracticeLogEntry {
        val alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
        val suffix = (1..5).map { alphabet[Random.nextInt(alphabet.length)] }.joinToString("")
        return PracticeLogEntry(
            id = "p_${now.toEpochMilli()}_$suffix",
            kind = kind,
            title = title,
            completedAt = ISO_MILLIS.format(now),
            localDate = now.atZone(zone).toLocalDate().toString(),
            durationMinutes = durationMinutes,
            result = result,
        )
    }

    /** At most [MAX_ENTRIES], oldest first; only the newest [MAX_SNAPSHOTS] keep their ritual. */
    fun trimmed(entries: List<PracticeLogEntry>): List<PracticeLogEntry> {
        val kept = entries.takeLast(MAX_ENTRIES)
        val snapshotFrom = kept.size - MAX_SNAPSHOTS
        return kept.mapIndexed { index, entry -> if (index < snapshotFrom && entry.result != null) entry.copy(result = null) else entry }
    }

    /** Adds entries from elsewhere. Entries are never edited, so an id seen twice is the same practice and is kept once. */
    fun merged(local: List<PracticeLogEntry>, incoming: List<PracticeLogEntry>): List<PracticeLogEntry> {
        val known = local.map { it.id }.toSet()
        val added = incoming.filter { it.id !in known }
        if (added.isEmpty()) return local
        return trimmed((local + added).sortedBy { it.completedInstant ?: Instant.EPOCH })
    }

    /**
     * Consecutive days with at least one practice. The streak stays alive
     * through today until the day ends, so it counts back from yesterday when
     * today has no practice yet.
     */
    fun streak(entries: List<PracticeLogEntry>, today: LocalDate = LocalDate.now()): Int {
        val days = entries.map { it.localDate }.toSet()
        var cursor = today
        if (cursor.toString() !in days) cursor = cursor.minusDays(1)
        var streak = 0
        while (cursor.toString() in days) {
            streak++
            cursor = cursor.minusDays(1)
        }
        return streak
    }
}

/** A page of the account's practice log. */
@Serializable
data class PracticePage(val entries: List<PracticeLogEntry>, val cursor: Long, val hasMore: Boolean)
