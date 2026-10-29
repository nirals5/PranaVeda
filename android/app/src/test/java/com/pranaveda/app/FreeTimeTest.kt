package com.pranaveda.app

import com.pranaveda.app.calendar.BusyInterval
import com.pranaveda.app.calendar.CalendarContext
import com.pranaveda.app.calendar.CalendarEvent
import com.pranaveda.app.calendar.FreeTime
import com.pranaveda.app.net.ChatMessage
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ChatRequest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale

/** Free time by the website's rules (src/hooks/useExternalCalendar.ts and useNudgeNotifications.ts), read from the phone's calendar. */
class FreeTimeTest {
    private val zone = ZoneId.of("America/Los_Angeles")
    /** Oct 29 2026 at h:m, Pacific. */
    private fun at(h: Int, m: Int = 0, day: Int = 29): Instant = LocalDateTime.of(2026, 10, day, h, m).atZone(zone).toInstant()
    private fun busy(a: Instant, b: Instant) = BusyInterval(a, b)

    @Test fun onlyRealCommitmentsMakeThemBusy() {
        val events = listOf(
            CalendarEvent(at(9), at(10)),
            CalendarEvent(at(9, 30), at(11)), // overlaps: merged
            CalendarEvent(at(0), at(0, day = 30), allDay = true),
            CalendarEvent(at(12), at(13), showsAsFree = true),
            CalendarEvent(at(14), at(15), cancelled = true),
            CalendarEvent(at(16), at(17), declined = true),
            CalendarEvent(at(18), at(18, 30)),
        )
        assertEquals(listOf(busy(at(9), at(11)), busy(at(18), at(18, 30))), FreeTime.busy(events))
    }

    @Test fun offersAnOpeningOnlyWhenTheRulesAllow() {
        Locale.setDefault(Locale.US)
        val day = listOf(busy(at(9), at(10)), busy(at(14), at(15)))
        val slot = FreeTime.openSlot(day, at(12, 20), null, zone)!!
        assertEquals(100, slot.minutes)
        assertEquals(at(14), slot.until)
        assertEquals("You have 100 open minutes, until 2:00 PM.", FreeTime.describe(slot, zone))
        assertEquals("I have about 100 free minutes right now. What would you suggest?", FreeTime.practiceNow(slot))

        assertNull(FreeTime.openSlot(day, at(9, 30), null, zone)) // in a commitment
        assertNull(FreeTime.openSlot(day, at(13, 55), null, zone)) // 5 minutes
        assertNull(FreeTime.openSlot(day, at(6, 30), null, zone)) // before 7
        assertNull(FreeTime.openSlot(day, at(22, 5), null, zone)) // after 10
        assertNull(FreeTime.openSlot(day, at(12), at(11), zone)) // just practised

        val evening = FreeTime.openSlot(day, at(16), null, zone)!!
        assertNull(evening.minutes)
        assertEquals("Your calendar is open for the rest of today.", FreeTime.describe(evening, zone))
    }

    @Test fun tellsAmritaTheShapeOfTheDayOnly() {
        Locale.setDefault(Locale.US)
        val day = listOf(busy(at(9), at(10)), busy(at(14), at(15)), busy(at(8, 30, day = 30), at(9, day = 30)))
        assertEquals(
            CalendarContext("Free for about 100 minutes, until 2:00 PM", listOf("2:00 PM–3:00 PM"), listOf("8:30 AM–9:00 AM")),
            FreeTime.context(day, at(12, 20), zone),
        )
        assertEquals("In a commitment until 3:00 PM", FreeTime.context(day, at(14, 30), zone).now)
        assertEquals("Free for the rest of today", FreeTime.context(day, at(16), zone).now)
        assertFalse(FreeTime.time(at(21, 35), zone).contains(' '))
    }

    @Test fun remindsAtMostOncePerOpeningAndThreeHoursApart() {
        val day = listOf(busy(at(9), at(10)), busy(at(11), at(12)))
        val first = FreeTime.openSlot(day, at(10, 15), null, zone)
        assertTrue(FreeTime.shouldRemind(first, at(10, 15), null, null))
        assertFalse(FreeTime.shouldRemind(first, at(10, 30), first!!.key, at(10, 15))) // same opening
        val afternoon = FreeTime.openSlot(day, at(12, 30), null, zone)
        assertFalse(FreeTime.shouldRemind(afternoon, at(12, 30), first.key, at(10, 15))) // under 3 hours
        assertTrue(FreeTime.shouldRemind(afternoon, at(13, 30), first.key, at(10, 15)))
        assertFalse(FreeTime.shouldRemind(null, at(13, 30), null, null))
    }

    @Test fun busyTimesGoWithAMessage() {
        val plain = ChatRequest(listOf(ChatMessage("user", "Hello")), JsonObject(emptyMap()), "10/29/2026, 12:20:00 PM", "2026-10-29")
        assertNull(PvJson.parseToJsonElement(PvJson.encodeToString(ChatRequest.serializer(), plain)).jsonObject["calendar"])
        val withCalendar = plain.copy(calendar = CalendarContext("Free for the rest of today", emptyList(), listOf("8:30 AM–9:00 AM")))
        val sent = PvJson.parseToJsonElement(PvJson.encodeToString(ChatRequest.serializer(), withCalendar)).jsonObject["calendar"]!!.jsonObject
        assertEquals("Free for the rest of today", sent["now"]!!.jsonPrimitive.content)
        assertEquals("8:30 AM–9:00 AM", sent["busyTomorrow"]!!.jsonArray.single().jsonPrimitive.content)
    }
}
