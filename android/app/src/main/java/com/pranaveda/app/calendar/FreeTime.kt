package com.pranaveda.app.calendar

import kotlinx.serialization.Serializable
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * When they are busy and when they are free, by the website's rules
 * (src/hooks/useExternalCalendar.ts and useNudgeNotifications.ts). Only
 * times are kept: what an event is never leaves the calendar.
 */
data class BusyInterval(val start: Instant, val end: Instant)

/** One event as the calendar gives it, reduced to what decides whether it makes them busy. */
data class CalendarEvent(
    val start: Instant,
    val end: Instant,
    val allDay: Boolean = false,
    /** Marked "free" (availability), so it does not block time. */
    val showsAsFree: Boolean = false,
    val cancelled: Boolean = false,
    /** They declined the invitation. */
    val declined: Boolean = false,
)

/** An opening Amrita may nudge in. One opening is one nudge, keyed by where it ends. */
data class OpenSlot(
    val key: String,
    /** When the next commitment starts; null when open for the rest of the day. */
    val until: Instant?,
    val minutes: Int?,
)

/**
 * What goes with a message, as the website sends it (CalendarContext in
 * api/index.ts): the shape of the day, never what the commitments are.
 */
@Serializable
data class CalendarContext(val now: String, val busyToday: List<String>, val busyTomorrow: List<String>)

object FreeTime {
    const val MIN_FREE_MINUTES = 10
    /** Nudges only from 7 AM until 10 PM. */
    val WAKING_HOURS = 7 until 22
    val REST_AFTER_PRACTICE: Duration = Duration.ofHours(2)
    /** The app has been off screen this long before a reminder. */
    val AWAY_BEFORE_REMINDER: Duration = Duration.ofMinutes(15)
    /** A day of short gaps must not become a stream of reminders. */
    val MIN_GAP_BETWEEN_REMINDERS: Duration = Duration.ofHours(3)

    /** All-day, cancelled, declined and "free" events leave the time open; the rest are merged into busy intervals. */
    fun busy(events: List<CalendarEvent>): List<BusyInterval> =
        merge(events.filter { !it.allDay && !it.showsAsFree && !it.cancelled && !it.declined && it.end > it.start }.map { BusyInterval(it.start, it.end) })

    fun merge(intervals: List<BusyInterval>): List<BusyInterval> {
        val merged = mutableListOf<BusyInterval>()
        for (interval in intervals.sortedBy { it.start }) {
            val last = merged.lastOrNull()
            if (last != null && interval.start <= last.end) merged[merged.size - 1] = last.copy(end = maxOf(last.end, interval.end))
            else merged += interval
        }
        return merged
    }

    /** Where [now] falls: inside a commitment (until = when it ends) or in open time (until = when the next one starts). */
    fun window(busy: List<BusyInterval>, now: Instant): Pair<Boolean, Instant?> {
        busy.firstOrNull { it.start <= now && now < it.end }?.let { return true to it.end }
        return false to busy.firstOrNull { it.start > now }?.start
    }

    /**
     * The opening Amrita may nudge in at [now], if any: never during a
     * commitment, in a gap too short to practise, outside waking hours, or
     * right after a practice.
     */
    fun openSlot(busy: List<BusyInterval>, now: Instant, lastPracticeAt: Instant?, zone: ZoneId = ZoneId.systemDefault()): OpenSlot? {
        val (busyNow, until) = window(busy, now)
        val local = now.atZone(zone)
        val midnight = local.toLocalDate().plusDays(1).atStartOfDay(zone).toInstant()
        val openUntil = until?.takeIf { it < midnight }
        val minutes = openUntil?.let { Duration.between(now, it).toMinutes().toInt() }
        if (busyNow || local.hour !in WAKING_HOURS || (minutes ?: Int.MAX_VALUE) < MIN_FREE_MINUTES) return null
        if (lastPracticeAt != null && Duration.between(lastPracticeAt, now) < REST_AFTER_PRACTICE) return null
        return OpenSlot((openUntil ?: midnight).toEpochMilli().toString(), openUntil, minutes)
    }

    fun describe(slot: OpenSlot, zone: ZoneId = ZoneId.systemDefault()): String =
        if (slot.minutes != null && slot.until != null) "You have ${slot.minutes} open minutes, until ${time(slot.until, zone)}."
        else "Your calendar is open for the rest of today."

    /** What "Practice now" says to Amrita, as on the website. */
    fun practiceNow(slot: OpenSlot): String =
        slot.minutes?.let { "I have about $it free minutes right now. What would you suggest?" }
            ?: "I have some open time right now. What would you suggest?"

    fun context(busy: List<BusyInterval>, now: Instant, zone: ZoneId = ZoneId.systemDefault()): CalendarContext {
        val today = now.atZone(zone).toLocalDate()
        val tomorrow = today.plusDays(1).atStartOfDay(zone).toInstant()
        val after = today.plusDays(2).atStartOfDay(zone).toInstant()
        val (busyNow, until) = window(busy, now)
        val range = { b: BusyInterval -> "${time(b.start, zone)}–${time(b.end, zone)}" }
        val state = when {
            busyNow && until != null -> "In a commitment until ${time(until, zone)}"
            until != null && until < tomorrow ->
                "Free for about ${Math.round(Duration.between(now, until).toSeconds() / 60.0)} minutes, until ${time(until, zone)}"
            else -> "Free for the rest of today"
        }
        return CalendarContext(
            now = state,
            busyToday = busy.filter { it.end > now && it.start < tomorrow }.map(range),
            busyTomorrow = busy.filter { it.start >= tomorrow && it.start < after }.map(range),
        )
    }

    /** "9:35 PM", with an ordinary space (some locales put a narrow one before PM, which the server would drop). */
    fun time(instant: Instant, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String =
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).withZone(zone).format(instant)
            .replace(' ', ' ').replace(' ', ' ')

    /**
     * Whether a reminder may show now, by the website's pacing: in an opening
     * the rules allow, at most one per opening and at least three hours after
     * the last. [lastKey] and [lastAt] describe the reminder shown before.
     */
    fun shouldRemind(slot: OpenSlot?, now: Instant, lastKey: String?, lastAt: Instant?): Boolean {
        if (slot == null) return false
        if (lastKey == slot.key) return false
        if (lastAt != null && Duration.between(lastAt, now) < MIN_GAP_BETWEEN_REMINDERS) return false
        return true
    }
}
