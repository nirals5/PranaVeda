package com.pranaveda.app.model

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.WeekFields
import java.util.Locale

/**
 * The month grid behind the practice calendar, following the website's
 * (src/components/PracticeCalendar.tsx): days are the log's "YYYY-MM-DD"
 * keys, so a practice sits on the day it was done wherever it was done.
 */
class PracticeCalendar(
    private val locale: Locale = Locale.getDefault(),
    /** Weeks start on the reader's own first weekday (Sunday in the US, as on the website). */
    val firstDayOfWeek: DayOfWeek = WeekFields.of(locale).firstDayOfWeek,
) {
    /** The month's days, the 1st first. */
    fun days(month: YearMonth): List<LocalDate> = (1..month.lengthOfMonth()).map { month.atDay(it) }

    /** Empty cells before the 1st, so it sits under its weekday. */
    fun leadingBlanks(month: YearMonth): Int = (month.atDay(1).dayOfWeek.value - firstDayOfWeek.value + 7) % 7

    /** Weekday initials and full names in display order. */
    val weekdays: List<Pair<String, String>>
        get() = (0L until 7L).map { offset ->
            val day = firstDayOfWeek.plus(offset)
            day.getDisplayName(TextStyle.NARROW, locale) to day.getDisplayName(TextStyle.FULL, locale)
        }

    /** What a reader hears for a day: "Friday, October 16, today, 2 practices". */
    fun dayDescription(day: LocalDate, practices: Int, today: LocalDate): String {
        val name = day.format(DateTimeFormatter.ofPattern("EEEE, MMMM d", locale))
        val count = when (practices) {
            0 -> "no practice"
            1 -> "1 practice"
            else -> "$practices practices"
        }
        return if (day == today) "$name, today, $count" else "$name, $count"
    }

    companion object {
        /** Each day's practices, in the order they were done. */
        fun byDay(entries: List<PracticeLogEntry>): Map<String, List<PracticeLogEntry>> = entries.groupBy { it.localDate }

        /** "4 practices this month · 3-day streak" */
        fun monthLine(count: Int, streak: Int): String {
            val practices = if (count == 1) "1 practice this month" else "$count practices this month"
            return if (streak > 0) "$practices · $streak-day streak" else practices
        }

        /** What the selected day's panel says when nothing was practiced. */
        fun emptyDayLine(day: LocalDate, today: LocalDate): String = when {
            day > today -> "This day has not arrived yet."
            day == today -> "Nothing practiced yet today. Finishing a ritual or a breathwork session marks the day."
            else -> "No practice was recorded on this day."
        }
    }
}
