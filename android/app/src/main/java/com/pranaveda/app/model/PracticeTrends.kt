package com.pranaveda.app.model

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters
import java.time.temporal.WeekFields
import java.util.Locale

/**
 * Practice trends from the practice log, for Recovery & Trends: real data only
 * (no sample figures), the same on every device because the log syncs. As the
 * iOS app works them out (PracticeTrends.swift).
 */
class PracticeTrends(
    entries: List<PracticeLogEntry>,
    today: LocalDate = LocalDate.now(),
    firstDay: DayOfWeek = WeekFields.of(Locale.getDefault()).firstDayOfWeek,
) {
    data class Week(
        /** The week's first day (the reader's first weekday). */
        val start: LocalDate,
        val rituals: Int = 0,
        val breathwork: Int = 0,
        val ritualMinutes: Int = 0,
        val breathworkMinutes: Int = 0,
    ) {
        val practices get() = rituals + breathwork
        val minutes get() = ritualMinutes + breathworkMinutes
    }

    /** Oldest first; the last is this week. */
    val weeks: List<Week>
    val currentStreak: Int = PracticeLog.streak(entries, today)
    val longestStreak: Int = longestStreak(entries.map { it.localDate }.toSet())
    /** Over the weeks shown; null with nothing practised. */
    val ritualShare: Double?

    val thisWeek get() = weeks.last()
    val lastWeek get() = weeks[weeks.size - 2]
    val isEmpty get() = weeks.all { it.practices == 0 } && longestStreak == 0

    init {
        val thisWeekStart = today.with(TemporalAdjusters.previousOrSame(firstDay))
        val built = (WEEKS_SHOWN - 1 downTo 0).map { Week(thisWeekStart.minusWeeks(it.toLong())) }.toMutableList()
        for (entry in entries) {
            val day = runCatching { LocalDate.parse(entry.localDate) }.getOrNull() ?: continue
            val index = built.indexOfLast { !it.start.isAfter(day) }
            if (index < 0 || !day.isBefore(built[index].start.plusWeeks(1))) continue
            val week = built[index]
            built[index] = if (entry.kind == PracticeLogEntry.Kind.Ritual) {
                week.copy(rituals = week.rituals + 1, ritualMinutes = week.ritualMinutes + entry.durationMinutes)
            } else {
                week.copy(breathwork = week.breathwork + 1, breathworkMinutes = week.breathworkMinutes + entry.durationMinutes)
            }
        }
        weeks = built
        val total = built.sumOf { it.practices }
        ritualShare = if (total == 0) null else built.sumOf { it.rituals }.toDouble() / total
    }

    companion object {
        const val WEEKS_SHOWN = 8

        /** The longest run of consecutive practice days ever logged. */
        fun longestStreak(days: Set<String>): Int {
            var longest = 0
            var run = 0
            var previous: LocalDate? = null
            for (day in days.mapNotNull { runCatching { LocalDate.parse(it) }.getOrNull() }.sorted()) {
                run = if (previous != null && previous.plusDays(1) == day) run + 1 else 1
                longest = maxOf(longest, run)
                previous = day
            }
            return longest
        }

        /** "4 practices · 38 min" */
        fun weekLine(week: Week): String {
            val practices = if (week.practices == 1) "1 practice" else "${week.practices} practices"
            return "$practices · ${week.minutes} min"
        }

        /** "Last week: 1 practice · 6 min". Plain, not a score: a quiet week is never told off. */
        fun lastWeekLine(week: Week): String = if (week.practices == 0) "Last week: no practice" else "Last week: ${weekLine(week)}"
    }
}
