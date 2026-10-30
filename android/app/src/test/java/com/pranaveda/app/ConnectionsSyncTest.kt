package com.pranaveda.app

import com.pranaveda.app.model.PvJson
import com.pranaveda.app.place.AccountConnections
import com.pranaveda.app.place.ConnectionsMerge
import com.pranaveda.app.place.PlaceKind
import com.pranaveda.app.place.SavedPlace
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Saved places on the account: the phone joins them as the website does (tests/connectionsMerge.test.ts), and reads the server's replies. */
class ConnectionsSyncTest {
    private val home = SavedPlace(PlaceKind.Home, 37.7749, -122.4194)
    private val otherHome = SavedPlace(PlaceKind.Home, 40.7, -74.0)
    private val work = SavedPlace(PlaceKind.Work, 37.79, -122.4)
    private val studio = SavedPlace(PlaceKind.Studio, 37.8, -122.41)

    @Test fun theAccountsSpotWinsAndThePhoneFillsTheGaps() {
        assertEquals(listOf(home, work, studio), ConnectionsMerge.join(listOf(home), listOf(otherHome, studio, work)))
        assertEquals(listOf(studio), ConnectionsMerge.join(emptyList(), listOf(studio)))
    }

    @Test fun orderDoesNotMatterButAMovedSpotDoes() {
        assertTrue(ConnectionsMerge.same(listOf(home, work), listOf(work, home)))
        assertFalse(ConnectionsMerge.same(listOf(home), listOf(otherHome)))
        assertFalse(ConnectionsMerge.same(listOf(home), listOf(home, work)))
    }

    @Test fun readsTheServersReplyAndIgnoresTheCalendarLink() {
        val json = """{"kept":true,"connections":{"places":[{"kind":"home","lat":37.7749,"lon":-122.4194}],"calendarLink":"webcal://x/a.ics"},"version":3}"""
        val reply = PvJson.decodeFromString(AccountConnections.serializer(), json)
        assertTrue(reply.kept)
        assertEquals(3, reply.version)
        assertEquals(listOf(home), reply.connections.places)
        assertFalse(reply.conflict)

        val off = PvJson.decodeFromString(AccountConnections.serializer(), """{"kept":false,"connections":{"places":[]},"version":0}""")
        assertFalse(off.kept)
    }
}
