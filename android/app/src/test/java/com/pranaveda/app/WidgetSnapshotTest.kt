package com.pranaveda.app

import com.pranaveda.app.model.DailyInsight
import com.pranaveda.app.model.DailyInsightStore
import com.pranaveda.app.model.PracticeLogEntry
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.model.SavedRitual
import com.pranaveda.app.model.YogaPractice
import com.pranaveda.app.widget.WidgetSnapshot
import com.pranaveda.app.widget.WidgetSnapshot.Day
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate

class WidgetSnapshotTest {
    private fun entry(id: String, localDate: String, kind: PracticeLogEntry.Kind = PracticeLogEntry.Kind.Ritual) =
        PracticeLogEntry(id, kind, id, "${localDate}T18:00:00.000Z", localDate, 10)

    private val friday = LocalDate.parse("2026-10-16")

    @Test fun countsTheStreakForTheDayItIsShown() {
        val snapshot = WidgetSnapshot(days = listOf("2026-10-14", "2026-10-15", "2026-10-16").associateWith { Day(ritual = true) })
        assertEquals(3, snapshot.streak(friday))
        // Saturday with nothing yet: still alive through yesterday.
        assertEquals(3, snapshot.streak(friday.plusDays(1)))
        assertNull(snapshot.practised(friday.plusDays(1)))
        // Sunday: a day was missed.
        assertEquals(0, snapshot.streak(friday.plusDays(2)))
    }

    @Test fun laysOutTheWeekFromTheFirstWeekday() {
        val snapshot = WidgetSnapshot(days = mapOf("2026-10-12" to Day(breathwork = true), "2026-10-16" to Day(ritual = true)))
        val week = snapshot.week(friday, DayOfWeek.SUNDAY)
        assertEquals(LocalDate.parse("2026-10-11"), week.first().first)
        assertEquals(7, week.size)
        assertEquals(2, week.count { it.second != null })
        assertEquals(Day(breathwork = true), week[1].second)
        assertEquals(LocalDate.parse("2026-10-12"), WidgetSnapshot().week(friday, DayOfWeek.MONDAY).first().first)
    }

    @Test fun showsTheReflectionOnlyOnItsOwnDay() {
        val snapshot = WidgetSnapshot(insight = WidgetSnapshot.Insight("H", "T", "F", "2026-10-16"))
        assertEquals("H", snapshot.insight(friday)?.headline)
        assertNull(snapshot.insight(friday.plusDays(1)))
    }

    @Test fun buildsTheSnapshotFromTheApp() {
        val reflection = DailyInsight("Rooted", "q", "Grounding", "Warm milk")
        val saved = SavedRitual("save_1_x", "Easing the Spine", "Oct 16", "", "Yoga", RecommendationResult(yogaPractice = YogaPractice("Easing the Spine")))
        val snapshot = WidgetSnapshot.from(
            listOf(entry("a", "2026-10-16"), entry("b", "2026-10-16", PracticeLogEntry.Kind.Breathwork), entry("old", "2024-01-01")),
            listOf(saved),
            DailyInsightStore.State.Loaded(reflection),
            friday,
        )
        assertEquals(Day(ritual = true, breathwork = true), snapshot.days["2026-10-16"])
        assertNull(snapshot.days["2024-01-01"]) // older than kept
        assertEquals(WidgetSnapshot.SavedRitualLink("save_1_x", "Easing the Spine"), snapshot.newestSaved)
        assertEquals(WidgetSnapshot.Insight("Rooted", "Warm milk", "Grounding", "2026-10-16"), snapshot.insight)
        // A stand-in reflection is never put on the home screen.
        val standIn = WidgetSnapshot.from(emptyList(), emptyList(), DailyInsightStore.State.Loaded(reflection.copy(isFallback = true)), friday)
        assertNull(standIn.insight)
    }

    @Test fun savesAndReadsTheSnapshot() {
        val file = File.createTempFile("widget", ".json")
        val snapshot = WidgetSnapshot(days = mapOf("2026-10-16" to Day(ritual = true)))
        snapshot.save(file)
        assertEquals(snapshot, WidgetSnapshot.load(file))
        file.delete()
        assertEquals(WidgetSnapshot(), WidgetSnapshot.load(file))
    }
}
