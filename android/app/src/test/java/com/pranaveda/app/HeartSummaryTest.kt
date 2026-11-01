package com.pranaveda.app

import com.pranaveda.app.model.HeartMeasurement
import com.pranaveda.app.model.HeartSummary
import com.pranaveda.app.model.PracticeLog
import com.pranaveda.app.model.PracticeLogEntry
import com.pranaveda.app.model.PvJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Heart rate across a practice, by the website's rules (src/hooks/useHeartRateMonitor.ts), with the iPhone's cases. */
class HeartSummaryTest {
    private fun bytes(vararg values: Int) = values.map { it.toByte() }.toByteArray()

    @Test
    fun `reads an 8-bit heart rate`() {
        assertEquals(HeartMeasurement(72, emptyList()), HeartMeasurement.parse(bytes(0x00, 72)))
    }

    @Test
    fun `reads a 16-bit heart rate`() {
        assertEquals(HeartMeasurement(300, emptyList()), HeartMeasurement.parse(bytes(0x01, 0x2C, 0x01)))
    }

    @Test
    fun `reads beat intervals, skipping energy expended`() {
        val reading = HeartMeasurement.parse(bytes(0x18, 60, 0xFF, 0xFF, 0x00, 0x04, 0x00, 0x02))!!
        assertEquals(60, reading.bpm)
        assertEquals(listOf(1000.0, 500.0), reading.rrMs)
    }

    @Test
    fun `a broken reading is ignored`() {
        assertNull(HeartMeasurement.parse(ByteArray(0)))
        assertNull(HeartMeasurement.parse(bytes(0x00)))
        assertNull(HeartMeasurement.parse(bytes(0x01, 60)))
        assertEquals(emptyList<Double>(), HeartMeasurement.parse(bytes(0x10, 60, 0x00))!!.rrMs)
    }

    @Test
    fun `start and end are the opening and closing fifths`() {
        val summary = HeartSummary.summarize((80 downTo 61).toList())!!
        assertEquals(79, summary.startBpm) // 78.5, rounded up as JavaScript does
        assertEquals(63, summary.endBpm) // 62.5
        assertEquals(71, summary.avgBpm) // 70.5
        assertEquals(61, summary.minBpm)
        assertEquals(80, summary.maxBpm)
        assertNull(summary.rmssd)
    }

    @Test
    fun `a short session uses at least three readings at each end`() {
        val summary = HeartSummary.summarize(listOf(90, 88, 86, 70, 70, 70, 70, 60, 62, 64))!!
        assertEquals(88, summary.startBpm)
        assertEquals(62, summary.endBpm)
    }

    @Test
    fun `too few readings say nothing`() {
        assertNull(HeartSummary.summarize(List(9) { 70 }))
        assertNull(HeartSummary.summarize(emptyList()))
    }

    @Test
    fun `RMSSD needs twenty clean pairs and ignores artifacts`() {
        val steady = List(21) { if (it % 2 == 0) 800.0 else 840.0 }
        assertEquals(40, HeartSummary.rmssd(steady))
        assertNull(HeartSummary.rmssd(steady.take(20)))
        assertEquals(40, HeartSummary.rmssd(steady + listOf(100.0, 5000.0)))
        assertNull(HeartSummary.rmssd(List(30) { if (it % 2 == 0) 600.0 else 1200.0 }))
    }

    @Test
    fun `the note matches the website`() {
        val summary = HeartSummary(78, 64, 70, 62, 80)
        assertEquals("Your heart rate moved from 78 to 64 bpm across this breathwork.", summary.movedNote(PracticeLogEntry.Kind.Breathwork))
        assertEquals("Your heart rate moved from 78 to 64 bpm across this practice.", summary.movedNote(PracticeLogEntry.Kind.Ritual))
    }

    @Test
    fun `a practice keeps its heart readings in the website's shape`() {
        val entry = PracticeLog.newEntry(PracticeLogEntry.Kind.Breathwork, "Box", 4, null, heart = HeartSummary(78, 64, 70, 62, 80))
        val json = PvJson.encodeToString(PracticeLogEntry.serializer(), entry)
        assert(""""heart":{"startBpm":78,"endBpm":64,"avgBpm":70,"minBpm":62,"maxBpm":80}""" in json)

        val website = """{"id":"p_1","kind":"ritual","title":"Morning","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14","durationMinutes":10,"heart":{"startBpm":70,"endBpm":62,"avgBpm":65,"minBpm":60,"maxBpm":72,"rmssd":41}}"""
        assertEquals(HeartSummary(70, 62, 65, 60, 72, 41), PvJson.decodeFromString(PracticeLogEntry.serializer(), website).heart)
    }

    @Test
    fun `a heart summary it can't read is dropped, keeping the practice`() {
        val odd = """{"id":"p_1","kind":"ritual","title":"Morning","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14","durationMinutes":10,"heart":{"startBpm":70}}"""
        val entry = PvJson.decodeFromString(PracticeLogEntry.serializer(), odd)
        assertEquals("Morning", entry.title)
        assertNull(entry.heart)
    }
}
