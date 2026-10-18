package com.pranaveda.app

import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.net.ChatMessage
import com.pranaveda.app.net.ChatRequest
import com.pranaveda.app.voice.AmritaVoice
import com.pranaveda.app.voice.VoiceListener
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VoiceTest {
    @Test fun readsTheReplyWithoutItsMarkup() {
        assertEquals("Let us slow the breath.", AmritaVoice.speakable("Let us **slow** the _breath_."))
        assertEquals("Warm water Early sleep", AmritaVoice.speakable("- Warm water\n- Early sleep"))
        assertEquals("See the guide now", AmritaVoice.speakable("See [the guide](https://example.com) # now"))
        assertEquals("Rest. Breathe.", AmritaVoice.speakable("""Rest. <break time="1s" /> Breathe."""))
        assertEquals("", AmritaVoice.speakable("```\ncode\n```"))
    }

    @Test fun aSpokenMessageIsMarkedAsVoice() {
        val request = ChatRequest(listOf(ChatMessage("user", "I feel scattered")), JsonObject(emptyMap()), "now", "2026-10-17", inputMode = "voice")
        val json = PvJson.parseToJsonElement(PvJson.encodeToString(ChatRequest.serializer(), request)).jsonObject
        assertEquals("voice", json["inputMode"]?.jsonPrimitive?.content)
    }

    @Test fun usesTheServersVoiceOnlyWhenItHasOne() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse.Builder().body("ID3-mp3-bytes").build())
            server.enqueue(MockResponse.Builder().code(503).body("""{"unavailable":true}""").build())
            server.start()
            val api = ApiClient(baseUrl = server.url("/"))
            assertArrayEquals("ID3-mp3-bytes".toByteArray(), api.speech("configured"))
            val sent = server.takeRequest()
            assertEquals("/api/tts", sent.url.encodedPath)
            assertEquals("configured", PvJson.parseToJsonElement(sent.body!!.utf8()).jsonObject["text"]?.jsonPrimitive?.content)
            assertNull(api.speech("not configured")) // the phone's own voice speaks instead
        }
    }

    @Test fun turnsLoudnessIntoWaveHeights() {
        assertEquals(0f, VoiceListener.normalizedLevel(-2f), 0.001f) // silence
        assertEquals(0.5f, VoiceListener.normalizedLevel(4f), 0.001f)
        assertEquals(1f, VoiceListener.normalizedLevel(15f), 0.001f) // loud: capped
        assertEquals(0f, VoiceListener.normalizedLevel(-10f), 0.001f)
    }

    @Test fun keepsTheWordsAcrossPauses() {
        assertEquals("I feel tense after work", VoiceListener.join("I feel tense", " after work "))
        assertEquals("after work", VoiceListener.join("", "after work"))
        assertEquals("I feel tense", VoiceListener.join("I feel tense", ""))
    }
}
