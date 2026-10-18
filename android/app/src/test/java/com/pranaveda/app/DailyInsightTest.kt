package com.pranaveda.app

import com.pranaveda.app.model.DailyInsight
import com.pranaveda.app.model.DailyInsightStore
import com.pranaveda.app.model.DailyInsightStore.State
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.net.HttpStatusException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class DailyInsightTest {
    private val reflection = DailyInsight(
        headline = "Rooted in the evening",
        quote = "Let the day settle like dust in still water.",
        focus = "Evening Grounding",
        tip = "Sip warm ginger water after dinner.",
    )
    private val evening = LocalDateTime.of(2026, 10, 16, 21, 5, 9)

    @Test fun postsTheProfileAndLocalTimeAndReadsTheReflection() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse.Builder().body("""{"headline":"A","quote":"B","focus":"C","tip":"D","_isFallback":true}""").build())
            server.start()
            val profile = JsonObject(mapOf("prakriti" to JsonPrimitive("Vata-Pitta")))
            val insight = ApiClient(baseUrl = server.baseUrl()).dailyInsight(profile, "10/16/2026, 9:05:09 PM")
            assertEquals(DailyInsight("A", "B", "C", "D", isFallback = true), insight)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/insight", request.url.encodedPath)
            val body = PvJson.parseToJsonElement(request.body!!.utf8()).jsonObject
            assertEquals(profile, body["profile"])
            assertEquals("10/16/2026, 9:05:09 PM", body["localTime"]?.jsonPrimitive?.content)
        }
    }

    @Test fun anOrdinaryReplyIsNotAStandIn() {
        assertFalse(PvJson.decodeFromString(DailyInsight.serializer(), """{"headline":"A","quote":"B","focus":"C","tip":"D"}""").isFallback)
    }

    @Test fun asksOncePerLaunch() = runTest {
        val sent = mutableListOf<Pair<JsonObject, String>>()
        val store = DailyInsightStore { profile, time -> sent += profile to time; reflection }
        assertEquals(State.Loading, store.state)
        store.loadIfNeeded(JsonObject(emptyMap()), evening)
        store.loadIfNeeded(JsonObject(emptyMap()), evening)
        assertEquals(State.Loaded(reflection), store.state)
        assertEquals(listOf(JsonObject(emptyMap()) to "10/16/2026, 9:05:09 PM"), sent)
    }

    @Test fun asksAgainAfterAStandInOrAFailure() = runTest {
        val standIn = reflection.copy(isFallback = true)
        val replies = ArrayDeque(listOf<() -> DailyInsight>({ standIn }, { throw HttpStatusException(500) }, { reflection }))
        var asked = 0
        val store = DailyInsightStore { _, _ -> asked++; replies.removeFirst()() }

        store.loadIfNeeded(JsonObject(emptyMap()), evening)
        assertEquals(State.Loaded(standIn), store.state) // shown, but not kept
        store.loadIfNeeded(JsonObject(emptyMap()), evening)
        assertEquals(State.Unavailable, store.state)
        store.loadIfNeeded(JsonObject(emptyMap()), evening)
        assertEquals(State.Loaded(reflection), store.state)
        store.loadIfNeeded(JsonObject(emptyMap()), evening)
        assertEquals(3, asked)
        assertTrue(replies.isEmpty())
    }
}
