package com.pranaveda.app.model

import kotlinx.serialization.Serializable
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.sqrt

/**
 * Heart rate across a practice, kept with it in the website's shape and worked
 * out by its rules (summarizeSession in src/hooks/useHeartRateMonitor.ts).
 * Readings are wellness signals, not medical measurements.
 */
@Serializable
data class HeartSummary(
    val startBpm: Int,
    val endBpm: Int,
    val avgBpm: Int,
    val minBpm: Int,
    val maxBpm: Int,
    /** HRV in ms, when the sensor reports beat-to-beat intervals. */
    val rmssd: Int? = null,
) {
    /** The note after a practice, in the website's words. */
    fun movedNote(kind: PracticeLogEntry.Kind): String {
        val what = if (kind == PracticeLogEntry.Kind.Breathwork) "breathwork" else "practice"
        return "Your heart rate moved from $startBpm to $endBpm bpm across this $what."
    }

    companion object {
        private const val MIN_SAMPLES = 10

        /** Rounds as JavaScript does, so every platform gets the same figure. */
        private fun round(value: Double) = floor(value + 0.5).toInt()

        /** RMSSD over plausible beat intervals. Pairs that jump by more than a quarter are sensor artifacts, not heartbeats. */
        fun rmssd(rrMs: List<Double>): Int? {
            val clean = rrMs.filter { it in 300.0..2000.0 }
            val squares = clean.zipWithNext { previous, next -> previous to next - previous }
                .filter { (previous, difference) -> abs(difference) <= previous * 0.25 }
                .map { (_, difference) -> difference * difference }
            if (squares.size < 20) return null
            return round(sqrt(squares.average()))
        }

        /** Start and end are the opening and closing fifths, so one stray reading cannot define either. Null with too few readings. */
        fun summarize(bpms: List<Int>, rrMs: List<Double> = emptyList()): HeartSummary? {
            if (bpms.size < MIN_SAMPLES) return null
            val edge = maxOf(3, bpms.size / 5)
            return HeartSummary(
                startBpm = round(bpms.take(edge).average()),
                endBpm = round(bpms.takeLast(edge).average()),
                avgBpm = round(bpms.average()),
                minBpm = bpms.min(),
                maxBpm = bpms.max(),
                rmssd = rmssd(rrMs),
            )
        }
    }
}

/** One reading from a sensor's Heart Rate Measurement characteristic (0x2A37). */
data class HeartMeasurement(val bpm: Int, val rrMs: List<Double>) {
    companion object {
        fun parse(bytes: ByteArray): HeartMeasurement? {
            fun byte(at: Int) = bytes[at].toInt() and 0xFF
            fun uint16(at: Int) = byte(at) or (byte(at + 1) shl 8)
            if (bytes.isEmpty()) return null
            val flags = byte(0)
            val wide = flags and 0x01 != 0
            if (bytes.size < if (wide) 3 else 2) return null
            val bpm = if (wide) uint16(1) else byte(1)
            var offset = if (wide) 3 else 2
            if (flags and 0x08 != 0) offset += 2 // energy expended
            val rrMs = mutableListOf<Double>()
            if (flags and 0x10 != 0) {
                while (offset + 1 < bytes.size) {
                    rrMs += uint16(offset) / 1024.0 * 1000.0
                    offset += 2
                }
            }
            return HeartMeasurement(bpm, rrMs)
        }
    }
}
