package com.pranaveda.app.widget

import com.pranaveda.app.model.DailyInsightStore
import com.pranaveda.app.model.PracticeLogEntry
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.model.SavedRitual
import kotlinx.serialization.Serializable
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters
import java.time.temporal.WeekFields
import java.util.Locale

/**
 * What the widgets show, as the iOS widgets read it (Shared/WidgetSnapshot.swift).
 * The app saves it whenever the practice log, saved rituals or today's insight
 * change; widgets never call the server.
 *
 * Days are kept rather than a ready-made streak, so a widget works the
 * streak, today and the week out when it is drawn and stays right after midnight.
 */
@Serializable
data class WidgetSnapshot(
    val insight: Insight? = null,
    /** Practice days of the last months, by "YYYY-MM-DD". */
    val days: Map<String, Day> = emptyMap(),
    val newestSaved: SavedRitualLink? = null,
) {
    @Serializable
    data class Insight(val headline: String, val tip: String, val focus: String, val localDate: String)

    @Serializable
    data class Day(val ritual: Boolean = false, val breathwork: Boolean = false)

    @Serializable
    data class SavedRitualLink(val id: String, val title: String)

    fun streak(today: LocalDate): Int {
        // The streak stays alive through today until the day ends.
        var day = if (days.containsKey(today.toString())) today else today.minusDays(1)
        var count = 0
        while (days.containsKey(day.toString())) {
            count++
            day = day.minusDays(1)
        }
        return count
    }

    fun practised(on: LocalDate): Day? = days[on.toString()]

    /** The week containing [today], starting on the reader's first weekday. */
    fun week(today: LocalDate, firstDay: DayOfWeek = WeekFields.of(Locale.getDefault()).firstDayOfWeek): List<Pair<LocalDate, Day?>> {
        val start = today.with(TemporalAdjusters.previousOrSame(firstDay))
        return (0L until 7L).map { start.plusDays(it).let { date -> date to days[date.toString()] } }
    }

    /** Today's insight, or null once its day has passed. */
    fun insight(today: LocalDate): Insight? = insight?.takeIf { it.localDate == today.toString() }

    fun save(file: File) {
        runCatching {
            val temp = File(file.parentFile, file.name + ".tmp")
            temp.writeText(PvJson.encodeToString(serializer(), this))
            temp.renameTo(file)
        }
    }

    companion object {
        /** How many days are kept: enough for a long streak to read true. */
        const val DAYS_KEPT = 400L

        fun load(file: File): WidgetSnapshot =
            runCatching { PvJson.decodeFromString(serializer(), file.readText()) }.getOrDefault(WidgetSnapshot())

        fun from(
            entries: List<PracticeLogEntry>,
            saved: List<SavedRitual>,
            insight: DailyInsightStore.State,
            today: LocalDate,
            previousInsight: Insight? = null,
        ): WidgetSnapshot {
            val oldest = today.minusDays(DAYS_KEPT).toString()
            val days = mutableMapOf<String, Day>()
            for (entry in entries) {
                if (entry.localDate < oldest) continue
                val day = days[entry.localDate] ?: Day()
                days[entry.localDate] = if (entry.kind == PracticeLogEntry.Kind.Ritual) day.copy(ritual = true) else day.copy(breathwork = true)
            }
            // A stand-in reflection is not shown on the home screen.
            val reflection = (insight as? DailyInsightStore.State.Loaded)?.insight?.takeIf { !it.isFallback }
            return WidgetSnapshot(
                insight = reflection?.let { Insight(it.headline, it.tip, it.focus, today.toString()) } ?: previousInsight,
                days = days,
                newestSaved = saved.firstOrNull()?.let { SavedRitualLink(it.id, it.title) },
            )
        }
    }
}

/** Links the widgets open, handled by MainActivity. */
object WidgetLink {
    const val SCHEME = "pranaveda"
    const val TALK = "pranaveda://talk"
    const val YOU = "pranaveda://you"
    fun savedRitual(id: String) = "pranaveda://ritual/$id"
}
