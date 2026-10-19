package com.pranaveda.app

import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.metadata.Metadata
import com.pranaveda.app.health.HealthStore
import com.pranaveda.app.health.HealthTrends
import com.pranaveda.app.health.HealthTrends.Span
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

class HealthTrendsTest {
    private val pacific = ZoneId.of("America/Los_Angeles")
    private fun at(iso: String) = Instant.parse(iso)

    @Test fun countsANightOnTheMorningYouWakeWithoutCountingOverlapsTwice() {
        // Thursday 11 pm to Friday 6:30 am Pacific from one app; 1–5 am of the same night from another.
        val one = Span(at("2026-10-16T06:00:00Z"), at("2026-10-16T13:30:00Z"))
        val other = Span(at("2026-10-16T08:00:00Z"), at("2026-10-16T12:00:00Z"))
        val nap = Span(at("2026-10-16T22:00:00Z"), at("2026-10-16T22:20:00Z"))
        val minutes = HealthTrends.sleepMinutes(listOf(other, nap, one), pacific)
        assertEquals(450 + 20, minutes[LocalDate.parse("2026-10-16")])
        assertNull(minutes[LocalDate.parse("2026-10-15")])
    }

    @Test fun averagesEachDaysReadings() {
        val averages = HealthTrends.dailyAverages(
            listOf(at("2026-10-16T15:00:00Z") to 60.0, at("2026-10-16T20:00:00Z") to 64.0, at("2026-10-15T15:00:00Z") to 70.0),
            pacific,
        )
        assertEquals(62.0, averages[LocalDate.parse("2026-10-16")]!!, 0.001)
        assertEquals(70.0, averages[LocalDate.parse("2026-10-15")]!!, 0.001)
    }

    @Test fun coversTheLastTwoWeeksEndingToday() {
        val today = LocalDate.parse("2026-10-16")
        val days = HealthTrends.combine(today, mapOf(today to 420), mapOf(today.minusDays(1) to 61.4), mapOf(LocalDate.parse("2026-10-03") to 48.0))
        assertEquals(14, days.size)
        assertEquals(LocalDate.parse("2026-10-03"), days.first().date)
        assertEquals(420, days.last().sleepMinutes)
        assertEquals(61.4, days[12].restingHeartRate!!, 0.001)
        assertEquals(48.0, days.first().hrv!!, 0.001)
        assertTrue(days[5].isEmpty)
        assertEquals("7h 30m", HealthTrends.hours(450))
        assertEquals("1h 05m", HealthTrends.hours(65))
    }

    @Test fun countsOnlyTheSleepingStagesOfASession() {
        val start = at("2026-10-16T06:00:00Z")
        val staged = SleepSessionRecord(
            startTime = start, startZoneOffset = ZoneOffset.UTC,
            endTime = start.plusSeconds(8 * 3600), endZoneOffset = ZoneOffset.UTC,
            metadata = Metadata.manualEntry(),
            stages = listOf(
                SleepSessionRecord.Stage(start, start.plusSeconds(1800), SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED),
                SleepSessionRecord.Stage(start.plusSeconds(1800), start.plusSeconds(5 * 3600), SleepSessionRecord.STAGE_TYPE_LIGHT),
                SleepSessionRecord.Stage(start.plusSeconds(5 * 3600), start.plusSeconds(8 * 3600), SleepSessionRecord.STAGE_TYPE_DEEP),
            ),
        )
        assertEquals(listOf(Span(start.plusSeconds(1800), start.plusSeconds(5 * 3600)), Span(start.plusSeconds(5 * 3600), start.plusSeconds(8 * 3600))), HealthStore.asleep(staged))
        val plain = SleepSessionRecord(
            startTime = start, startZoneOffset = ZoneOffset.UTC, endTime = start.plusSeconds(3600), endZoneOffset = ZoneOffset.UTC,
            metadata = Metadata.manualEntry(),
        )
        assertEquals(listOf(Span(start, start.plusSeconds(3600))), HealthStore.asleep(plain))
    }
}
