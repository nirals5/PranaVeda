package com.pranaveda.app

import com.pranaveda.app.place.Arrival
import com.pranaveda.app.place.PlaceKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

/** Arrival reminders, paced like the free-time reminders (the iOS ArrivalTests cases). */
class ArrivalTest {
    private val zone = ZoneId.of("America/Los_Angeles")
    /** Oct 30 2026 at h:m, Pacific. */
    private fun at(h: Int, m: Int = 0, day: Int = 30): Instant = LocalDateTime.of(2026, 10, day, h, m).atZone(zone).toInstant()
    private fun remind(
        kind: PlaceKind = PlaceKind.Home,
        at: Instant,
        practice: Instant? = null,
        last: Instant? = null,
        reminded: Instant? = null,
        busy: Boolean = false,
    ) = Arrival.shouldRemind(kind, at, practice, last, reminded, busy, zone)

    @Test fun remindsOnArrivingHomeInWakingHours() {
        assertTrue(remind(at = at(18, 5)))
        assertTrue(remind(PlaceKind.Studio, at(7)))
        assertTrue(remind(PlaceKind.Outdoors, at(21, 59)))
    }

    @Test fun neverAtWork() {
        assertFalse(remind(PlaceKind.Work, at(9)))
        assertFalse(PlaceKind.Work in Arrival.KINDS)
    }

    @Test fun onlyBetweenSevenAndTen() {
        assertFalse(remind(at = at(6, 59)))
        assertFalse(remind(at = at(22)))
    }

    @Test fun notSoonAfterAPracticeOrAnotherReminder() {
        assertFalse(remind(at = at(18), practice = at(16, 30)))
        assertTrue(remind(at = at(18), practice = at(16)))
        assertFalse(remind(at = at(18), last = at(15, 30)))
        assertTrue(remind(at = at(18), last = at(15)))
    }

    @Test fun oncePerPlaceEachDay() {
        assertFalse(remind(at = at(20), reminded = at(9)))
        assertTrue(remind(at = at(9), reminded = at(20, day = 29)))
    }

    @Test fun quietDuringACommitment() {
        assertFalse(remind(at = at(18), busy = true))
    }

    @Test fun eachPlaceHasItsOwnNote() {
        assertEquals("You're home. A few minutes of slow breathing to settle in?", Arrival.text(PlaceKind.Home))
        assertEquals(Arrival.KINDS.size, Arrival.KINDS.map(Arrival::text).toSet().size)
        assertEquals(Duration.ofMinutes(5), Arrival.STAY)
    }
}
