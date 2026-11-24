package com.pranaveda.app.push

import com.pranaveda.app.calendar.BusyInterval
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneId

/**
 * Free-time nudges sent by the server through Firebase Cloud Messaging
 * (KAN-31). The server's nudge check already reaches the website, the iPhone
 * and Alexa; with this phone registered, one opening is one nudge wherever it
 * lands. While it works, the phone shows no free-time reminders of its own
 * (they would come twice); signed out, or without Firebase settings in the
 * build, it shows them as before. Arrival reminders always stay on the phone.
 */
object PushNudges {
    /** Where a server nudge opens, as on the website. */
    const val URL = "/?nudge=1"

    fun isServerNudge(data: Map<String, String>): Boolean = data["url"] == URL

    /** What the server needs from the calendar: busy start and end times only (epoch ms), today and tomorrow. */
    fun calendarUpload(trusted: Boolean, busy: List<BusyInterval>, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): CalendarUpload {
        if (!trusted) return CalendarUpload(trusted = false, google = false)
        val until = now.atZone(zone).toLocalDate().plusDays(2).atStartOfDay(zone).toInstant()
        return CalendarUpload(
            trusted = true,
            google = false,
            busy = busy.map { listOf(it.start.toEpochMilli(), it.end.toEpochMilli()) },
            coveredUntil = until.toEpochMilli(),
        )
    }
}

/** As the website sends it (api/_lib/push.ts parseCalendarUpload). */
@Serializable
data class CalendarUpload(
    val trusted: Boolean,
    val google: Boolean,
    val busy: List<List<Long>>? = null,
    val coveredUntil: Long? = null,
)
