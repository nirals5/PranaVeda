package com.pranaveda.app

import com.pranaveda.app.model.Catalog
import com.pranaveda.app.model.PvJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Library → Explore (G3): the advanced poses Amrita never offers. */
class ExploreTest {
    private val json = """
        {"poses": [], "breathwork": [], "explore": [{
          "id": "P33", "nameSanskrit": "Sirsasana", "nameEnglish": "Headstand",
          "bodyFocus": "Full-Body / Inversion / Core", "benefits": "A full inversion that builds focus.",
          "cues": ["Learn it with a teacher"], "commonMistakes": ["Kicking up"], "modifications": "Dolphin Pose first.",
          "avoidWith": [
            {"code": "neck_injury", "label": "Neck injury", "words": ["stiff neck", "whiplash"]},
            {"code": "hypertension", "label": "High blood pressure", "words": ["high bp"]}
          ],
          "followWith": "Child's Pose", "avoidAfterMeal": true
        }]}
    """.trimIndent()

    @Test fun decodesTheExploreList() {
        val headstand = PvJson.decodeFromString<Catalog>(json).explore.single()
        assertEquals("Headstand", headstand.nameEnglish)
        assertEquals("Child's Pose", headstand.followWith)
        assertTrue(headstand.avoidAfterMeal)
        assertEquals(null, headstand.sourceCaution)
    }

    @Test fun olderServersHaveNoExplore() {
        assertTrue(PvJson.decodeFromString<Catalog>("""{"poses": [], "breathwork": []}""").explore.isEmpty())
    }

    @Test fun saysWhenItIsNotForThem() {
        val headstand = PvJson.decodeFromString<Catalog>(json).explore.single()
        assertEquals(listOf("Neck injury"), headstand.notFor(listOf("Whiplash last year")))
        assertEquals(listOf("Neck injury", "High blood pressure"), headstand.notFor(listOf("high BP", "neck injury")))
        assertEquals(listOf("High blood pressure"), headstand.notFor(listOf("hypertension")))
        assertTrue(headstand.notFor(listOf("sore knee")).isEmpty())
        // A whole word only: "neck" in "necklace" is not a neck injury.
        assertTrue(headstand.notFor(listOf("allergic to my necklace")).isEmpty())
        assertTrue(headstand.notFor(emptyList()).isEmpty())
    }
}
