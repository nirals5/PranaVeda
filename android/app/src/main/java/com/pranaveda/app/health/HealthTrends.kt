package com.pranaveda.app.health

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * One day of heart and sleep readings from Health Connect, for Recovery &
 * Trends. Read on the phone and never sent anywhere. As the iOS app reads
 * Apple Health (HealthTrends.swift).
 */
data class HealthDay(
    /** The day the readings belong to (sleep: the morning you woke). */
    val date: LocalDate,
    val sleepMinutes: Int? = null,
    val restingHeartRate: Double? = null,
    /** Heart-rate variability in milliseconds, as RMSSD (Apple Health uses SDNN; the chart names which). */
    val hrv: Double? = null,
) {
    val isEmpty get() = sleepMinutes == null && restingHeartRate == null && hrv == null
}

object HealthTrends {
    const val DAYS_SHOWN = 14

    /** A stretch of time, start inclusive, end exclusive. */
    data class Span(val start: Instant, val end: Instant)

    /** The last 14 days, oldest first, ending today. */
    fun days(today: LocalDate): List<LocalDate> = (DAYS_SHOWN - 1 downTo 0).map { today.minusDays(it.toLong()) }

    /**
     * Minutes asleep per morning. Overlapping records (two apps logging the
     * same night) are merged first so time is not counted twice; each stretch
     * belongs to the day it ends on.
     */
    fun sleepMinutes(spans: List<Span>, zone: ZoneId = ZoneId.systemDefault()): Map<LocalDate, Int> {
        val merged = mutableListOf<Span>()
        for (span in spans.filter { it.end.isAfter(it.start) }.sortedBy { it.start }) {
            val last = merged.lastOrNull()
            if (last != null && !span.start.isAfter(last.end)) {
                merged[merged.lastIndex] = Span(last.start, maxOf(last.end, span.end))
            } else {
                merged += span
            }
        }
        val minutes = mutableMapOf<LocalDate, Int>()
        for (span in merged) {
            val day = span.end.atZone(zone).toLocalDate()
            minutes[day] = (minutes[day] ?: 0) + Math.round((span.end.epochSecond - span.start.epochSecond) / 60.0).toInt()
        }
        return minutes
    }

    /** The average of readings taken at moments, per day. */
    fun dailyAverages(readings: List<Pair<Instant, Double>>, zone: ZoneId = ZoneId.systemDefault()): Map<LocalDate, Double> =
        readings.groupBy({ it.first.atZone(zone).toLocalDate() }, { it.second }).mapValues { (_, values) -> values.average() }

    fun combine(
        today: LocalDate,
        sleep: Map<LocalDate, Int>,
        restingHeartRate: Map<LocalDate, Double>,
        hrv: Map<LocalDate, Double>,
    ): List<HealthDay> = days(today).map { HealthDay(it, sleep[it], restingHeartRate[it], hrv[it]) }

    /** "7h 20m" */
    fun hours(minutes: Int) = "${minutes / 60}h %02dm".format(minutes % 60)
}
