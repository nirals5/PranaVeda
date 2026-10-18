package com.pranaveda.app

import com.pranaveda.app.model.PvJson
import com.pranaveda.app.model.SavedDoshaProfile
import com.pranaveda.app.net.ApiClient
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DoshaProfileTest {
    private fun profile(json: String) = PvJson.parseToJsonElement(json).jsonObject

    @Test fun readsTheAssessmentAmritaSavedToTheProfile() {
        val dosha = SavedDoshaProfile.from(
            profile(
                """{"name":"Meera","prakriti":"Vata-Pitta","doshaProfile":{
                  "primary":"Vata","secondary":"Pitta","balance":{"vata":55,"pitta":30,"kapha":15},
                  "essence":"Quick as the wind","explanation":"Airy and bright.","guidance":["Keep warm"],
                  "confidence":"medium","assessedDate":"2026-10-12","futureField":true}}""",
            ),
        )!!
        assertEquals("Vata", dosha.primary)
        assertEquals("Pitta", dosha.secondary)
        assertEquals(15.0, dosha.balance.kapha, 0.0)
        assertEquals(listOf("Keep warm"), dosha.guidance)
        assertEquals("2026-10-12", dosha.assessedDate)
    }

    @Test fun invitesTheDiscoveryWithoutACompleteAssessment() {
        assertNull(SavedDoshaProfile.from(profile("""{"prakriti":"Kapha"}""")))
        assertNull(SavedDoshaProfile.from(profile("""{"doshaProfile":{"primary":"Kapha"}}""")))
        assertNull(SavedDoshaProfile.from(profile("""{"doshaProfile":"not an object"}""")))
        assertNull(SavedDoshaProfile.from(JsonObject(emptyMap())))
    }

    @Test fun describesConfidenceAndDateAsTheWebsiteDoes() {
        assertEquals("medium confidence · 2026-10-12", SavedDoshaProfile.confidenceLine("medium", "2026-10-12"))
        assertEquals("high confidence", SavedDoshaProfile.confidenceLine("high", null))
        assertNull(SavedDoshaProfile.confidenceLine(null, null))
    }

    @Test fun loadsTheGuideFromTheServer() = runTest {
        MockWebServer().use { server ->
            server.enqueue(
                MockResponse.Builder().body(
                    """{"doshas":{"Vata":{"tagline":"Air & Space","qualities":"Light","aggravatedBy":"Wind","balancedBy":"Warmth",
                       "diet":["Soups"],"lifestyle":["Routine"],"breath":"Nadi Shodhana","practiceStyle":"Slow","rhythm":"Early","season":"Autumn"}},
                       "note":"Not a medical diagnosis."}""",
                ).build(),
            )
            server.start()
            val guide = ApiClient(baseUrl = server.baseUrl()).doshaGuide()
            assertEquals(listOf("Soups"), guide.doshas.getValue("Vata").diet)
            assertEquals("Not a medical diagnosis.", guide.note)
            assertEquals("/api/dosha-guide", server.takeRequest().url.encodedPath)
        }
    }
}
