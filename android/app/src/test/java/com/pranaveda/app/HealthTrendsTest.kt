package com.pranaveda.app

import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.metadata.Metadata
import com.pranaveda.app.health.HealthStore
import com.pranaveda.app.health.HealthSummary
import com.pranaveda.app.health.HealthTrends
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ChatRequest
import kotlinx.serialization.json.JsonObject
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

    // What Amrita is told

    private val today = LocalDate.parse("2026-10-16")
    private fun days(sleep: Map<String, Int> = emptyMap(), resting: Map<String, Double> = emptyMap(), hrv: Map<String, Double> = emptyMap()) =
        HealthTrends.combine(
            today,
            sleep.mapKeys { LocalDate.parse(it.key) },
            resting.mapKeys { LocalDate.parse(it.key) },
            hrv.mapKeys { LocalDate.parse(it.key) },
        )

    @Test fun summarisesEachReadingBesideTheirUsualAsTheWebsiteDoes() {
        val summary = HealthTrends.summary(
            days(
                sleep = mapOf("2026-10-13" to 420, "2026-10-14" to 450, "2026-10-15" to 435, "2026-10-16" to 310),
                resting = mapOf("2026-10-12" to 60.0, "2026-10-13" to 61.0, "2026-10-14" to 59.0, "2026-10-15" to 66.4),
                hrv = mapOf("2026-10-10" to 50.0, "2026-10-12" to 46.0, "2026-10-14" to 48.0, "2026-10-16" to 38.6),
            ),
            today,
        )
        assertEquals(HealthSummary.Sleep(310, 435), summary?.sleep)
        assertEquals(HealthSummary.Reading(66, 60), summary?.restingHeartRate)
        assertEquals(HealthSummary.Reading(39, 48, "rmssd"), summary?.hrv)
    }

    @Test fun leavesOutAReadingThatIsStaleOrHasTooFewDays() {
        val none = HealthTrends.summary(
            days(
                sleep = mapOf("2026-10-14" to 420, "2026-10-15" to 450, "2026-10-16" to 300),
                resting = mapOf("2026-10-11" to 60.0, "2026-10-12" to 61.0, "2026-10-13" to 59.0, "2026-10-14" to 70.0),
            ),
            today,
        )
        assertNull(none)
        val yesterday = HealthTrends.summary(days(resting = mapOf("2026-10-12" to 60.0, "2026-10-13" to 61.0, "2026-10-14" to 59.0, "2026-10-15" to 70.0)), today)
        assertEquals(HealthSummary.Reading(70, 60), yesterday?.restingHeartRate)
    }

    @Test fun sendsTheSummaryInTheShapeTheServerReads() {
        val summary = HealthSummary(hrv = HealthSummary.Reading(39, 48, "rmssd"), sleep = HealthSummary.Sleep(310, 435))
        val json = PvJson.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList(), JsonObject(emptyMap()), "x", "2026-10-16", health = summary))
        assertTrue(json, json.contains(""""health":{"hrv":{"latest":39,"usual":48,"metric":"rmssd"},"sleep":{"lastNightMinutes":310,"usualMinutes":435}}"""))
        val plain = PvJson.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList(), JsonObject(emptyMap()), "x", "2026-10-16"))
        assertTrue(plain, !plain.contains("health"))
    }
}
