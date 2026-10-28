package com.pranaveda.app

import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ChatRequest
import com.pranaveda.app.place.CurrentPlace
import com.pranaveda.app.place.LocationContext
import com.pranaveda.app.place.PlaceKind
import com.pranaveda.app.place.PlacePosition
import com.pranaveda.app.place.Places
import com.pranaveda.app.place.SavedPlace
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Saved places: the website's rules (src/hooks/usePlace.ts), and what reaches Amrita. */
class PlaceTest {
    private val home = SavedPlace(PlaceKind.Home, 37.7749, -122.4194)
    private val work = SavedPlace(PlaceKind.Work, 37.7899, -122.4010)

    @Test fun distanceIsRoughlyRight() {
        // 0.001° of latitude is about 111 m.
        assertEquals(111.2, Places.distanceMetres(37.0, -122.0, 37.001, -122.0), 1.0)
    }

    @Test fun matchesTheNearestSavedPlaceWithin150Metres() {
        val nearHome = PlacePosition(37.7757, -122.4194, 20.0) // ~90 m away
        assertEquals(CurrentPlace.Saved(PlaceKind.Home), Places.match(nearHome, listOf(home, work)))
    }

    @Test fun aGoodPositionAwayFromEverySavedPlaceIsElsewhere() {
        assertEquals(CurrentPlace.Elsewhere, Places.match(PlacePosition(37.7694, -122.4862, 30.0), listOf(home, work)))
    }

    @Test fun aVaguePositionWidensTheNetButNotPast500Metres() {
        assertEquals(CurrentPlace.Saved(PlaceKind.Home), Places.match(PlacePosition(37.7785, -122.4194, 450.0), listOf(home)))
        assertEquals(CurrentPlace.Elsewhere, Places.match(PlacePosition(37.7803, -122.4194, 1500.0), listOf(home)))
    }

    @Test fun roughPositionsAndNoSavedPlacesSayNothing() {
        assertNull(Places.match(PlacePosition(37.7749, -122.4194, 3000.0), listOf(home)))
        assertNull(Places.match(PlacePosition(37.7749, -122.4194, 10.0), emptyList()))
        assertNull(Places.match(null, listOf(home)))
    }

    @Test fun nothingGoesToAmritaWhileOff() {
        val atHome = PlacePosition(home.lat, home.lon, 10.0)
        assertNull(Places.context(enabled = false, atHome, listOf(home)))
        assertEquals(LocationContext("home"), Places.context(enabled = true, atHome, listOf(home)))
        assertEquals(LocationContext("elsewhere"), Places.context(enabled = true, PlacePosition(work.lat, work.lon, 10.0), listOf(home)))
    }

    @Test fun savingMovesTheOneSpotPerKindAndARoughPositionIsNotSaved() {
        val atWork = PlacePosition(work.lat, work.lon, 10.0)
        assertEquals(listOf(SavedPlace(PlaceKind.Home, work.lat, work.lon)), Places.save(listOf(home), PlaceKind.Home, atWork))
        assertEquals(listOf(home), Places.save(listOf(home), PlaceKind.Home, PlacePosition(work.lat, work.lon, 5000.0)))
        assertEquals(listOf(home), Places.save(listOf(home), PlaceKind.Work, null))
    }

    @Test fun savedPlacesRoundTripInTheWebsitesShape() {
        val json = Places.encode(listOf(home))
        assertTrue(json.contains("\"kind\":\"home\""))
        assertEquals(listOf(home), Places.decode(json))
        assertEquals(emptyList<SavedPlace>(), Places.decode("not json"))
        assertEquals(emptyList<SavedPlace>(), Places.decode(null))
    }

    @Test fun onlyTheKindOfPlaceIsSentWithAMessage() {
        val without = ChatRequest(messages = emptyList(), profile = JsonObject(emptyMap()), localTime = "t", localDate = "2026-10-27")
        assertFalse("location" in PvJson.encodeToJsonElement(ChatRequest.serializer(), without).jsonObject)
        val with = without.copy(location = LocationContext("work"))
        val location = PvJson.encodeToJsonElement(ChatRequest.serializer(), with).jsonObject["location"]!!.jsonObject
        assertEquals(setOf("place"), location.keys)
        assertEquals("work", location["place"]!!.jsonPrimitive.content)
    }
}
