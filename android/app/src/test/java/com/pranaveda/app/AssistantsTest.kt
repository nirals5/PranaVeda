package com.pranaveda.app

import com.pranaveda.app.model.Assistants
import com.pranaveda.app.net.ApiClient
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The Smart assistants card: Alexa only once the server says the skill is published. */
class AssistantsTest {
    @Test fun leavesAlexaOutUntilItIsPublished() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse.Builder().body("""{"alexa":null}""").build())
            server.start()
            assertNull(ApiClient(baseUrl = server.baseUrl()).assistants().alexa)
            assertEquals("/api/assistants", server.takeRequest().url.encodedPath)
        }
    }

    @Test fun listsAlexaWithItsPageAndPhrases() = runTest {
        MockWebServer().use { server ->
            server.enqueue(
                MockResponse.Builder()
                    .body("""{"alexa":{"url":"https://www.amazon.com/dp/B0EXAMPLE1","phrases":["Alexa, open Prana Veda"]}}""")
                    .build(),
            )
            server.start()
            val alexa = ApiClient(baseUrl = server.baseUrl()).assistants().alexa!!
            assertEquals("https://www.amazon.com/dp/B0EXAMPLE1", alexa.url)
            assertEquals(listOf("Alexa, open Prana Veda"), alexa.phrases)
        }
    }

    @Test fun phoneShortcutsMatchTheLongPressMenu() {
        assertEquals(listOf("Talk to Amrita", "Start my practice"), Assistants.PHONE_SHORTCUTS)
    }
}
