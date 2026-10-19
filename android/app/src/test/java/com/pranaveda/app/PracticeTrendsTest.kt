package com.pranaveda.app

import com.pranaveda.app.model.PracticeLogEntry
import com.pranaveda.app.model.PracticeTrends
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDate

class PracticeTrendsTest {
    private val friday = LocalDate.parse("2026-10-16")
    private fun entry(id: String, localDate: String, kind: PracticeLogEntry.Kind = PracticeLogEntry.Kind.Ritual, minutes: Int = 10) =
        PracticeLogEntry(id, kind, id, "${localDate}T18:00:00.000Z", localDate, minutes)

    @Test fun addsUpEachOfTheLastEightWeeks() {
        val trends = PracticeTrends(
            listOf(
                entry("a", "2026-10-16", minutes = 12), entry("b", "2026-10-11", PracticeLogEntry.Kind.Breathwork, minutes = 3), // this week (from Sun 11)
                entry("c", "2026-10-10", minutes = 20), // last week
                entry("d", "2026-08-22"), // before the oldest week shown (Sun 23 Aug)
            ),
            friday,
            DayOfWeek.SUNDAY,
        )
        assertEquals(8, trends.weeks.size)
        assertEquals(LocalDate.parse("2026-08-23"), trends.weeks.first().start)
        assertEquals(1, trends.thisWeek.rituals)
        assertEquals(1, trends.thisWeek.breathwork)
        assertEquals(15, trends.thisWeek.minutes)
        assertEquals(20, trends.lastWeek.minutes)
        assertEquals(3, trends.weeks.sumOf { it.practices })
        assertEquals(2.0 / 3.0, trends.ritualShare!!, 0.001)
    }

    @Test fun findsTheLongestStreakEver() {
        val days = setOf("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-10", "2026-10-15", "2026-10-16")
        assertEquals(4, PracticeTrends.longestStreak(days))
        assertEquals(0, PracticeTrends.longestStreak(emptySet()))
        val trends = PracticeTrends(days.map { entry(it, it) }, friday, DayOfWeek.SUNDAY)
        assertEquals(2, trends.currentStreak)
        assertEquals(4, trends.longestStreak)
    }

    @Test fun describesTheWeeks() {
        val week = PracticeTrends.Week(friday, rituals = 3, ritualMinutes = 30)
        assertEquals("3 practices · 30 min", PracticeTrends.weekLine(week))
        assertEquals("Last week: 1 practice · 6 min", PracticeTrends.lastWeekLine(PracticeTrends.Week(friday, rituals = 1, ritualMinutes = 6)))
        assertEquals("Last week: no practice", PracticeTrends.lastWeekLine(PracticeTrends.Week(friday)))
        assertTrue(PracticeTrends(emptyList(), friday, DayOfWeek.SUNDAY).isEmpty)
    }
}
