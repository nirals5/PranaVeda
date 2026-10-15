package com.pranaveda.app

import com.pranaveda.app.model.ChatCard
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.net.ChatEvent
import com.pranaveda.app.net.ChatMessage
import com.pranaveda.app.net.ChatRequest
import com.pranaveda.app.net.HttpStatusException
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** The client against a stand-in server that answers like /api/chat and /api/catalog. */
class ApiClientTest {
    private val server = MockWebServer()
    private lateinit var api: ApiClient

    @Before fun start() {
        server.start()
        api = ApiClient(baseUrl = server.url("/"))
    }

    @After fun stop() = server.close()

    private val request = ChatRequest(
        messages = listOf(ChatMessage("user", "I feel restless")),
        profile = JsonObject(mapOf("name" to JsonPrimitive("Meera"))),
        localTime = "10/14/2026, 9:00:00 PM",
        localDate = "2026-10-14",
    )

    @Test fun streamsEventsAndSendsTheGuestRequest() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "text/event-stream")
                .body(
                    "data: {\"type\":\"text\",\"delta\":\"Let us \"}\n\n" +
                        "data: {\"type\":\"text\",\"delta\":\"breathe.\"}\n\n" +
                        "data: {\"type\":\"card\",\"card\":{\"kind\":\"options\",\"options\":[{\"label\":\"Calm\"}]}}\n\n" +
                        "data: {\"type\":\"profile\",\"profile\":{\"name\":\"Meera\",\"energy\":\"low\"}}\n\n" +
                        "data: {\"type\":\"done\"}\n\n",
                )
                .build(),
        )

        val events = api.chat(request).toList()

        assertEquals(ChatEvent.Text("Let us "), events[0])
        assertEquals(ChatEvent.Text("breathe."), events[1])
        assertTrue((events[2] as ChatEvent.Card).card is ChatCard.Options)
        assertEquals("low", (events[3] as ChatEvent.Profile).profile["energy"]?.jsonPrimitive?.content)
        assertEquals(ChatEvent.Done, events[4])

        val sent = server.takeRequest()
        assertEquals("/api/chat", sent.url.encodedPath)
        assertEquals("text/event-stream", sent.headers["Accept"])
        assertFalse("guests send no credentials", sent.headers.names().contains("Authorization"))
        val body = PvJson.parseToJsonElement(sent.body!!.utf8()).jsonObject
        assertEquals("text", body["inputMode"]?.jsonPrimitive?.content)
        assertEquals("2026-10-14", body["localDate"]?.jsonPrimitive?.content)
        assertEquals("Meera", body["profile"]?.jsonObject?.get("name")?.jsonPrimitive?.content)
        assertFalse("no previous session is sent as absent, not null", body.containsKey("previousSession"))
    }

    @Test fun reportsAnHttpErrorBeforeStreaming() = runTest {
        server.enqueue(MockResponse.Builder().code(429).body("{}").build())
        try {
            api.chat(request).toList()
            fail("expected an error")
        } catch (e: HttpStatusException) {
            assertEquals(429, e.status)
        }
    }

    @Test fun loadsTheCatalog() = runTest {
        server.enqueue(
            MockResponse.Builder().body(
                """{"poses":[{"id":"cobra","nameSanskrit":"Bhujangasana","nameEnglish":"Cobra","level":"beginner",
                   "bodyFocus":"spine","cues":["Press"],"benefits":"Opens","contraindications":[],
                   "poseImageUrl":"http://x/poses/cobra.jpg","futureField":true}],
                   "breathwork":[]}""",
            ).build(),
        )
        val catalog = api.catalog()
        assertEquals("Cobra", catalog.poses.single().nameEnglish)
        assertEquals("/api/catalog", server.takeRequest().url.encodedPath)
    }
}
