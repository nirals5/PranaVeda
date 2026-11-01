package com.pranaveda.app

import com.pranaveda.app.auth.VersionedProfile
import com.pranaveda.app.model.ProfileOffer
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** What a phone knew before sign-in that the account doesn't, and adding it on a yes. The same cases as the website (tests/profileOffer.test.ts). */
class ProfileOfferTest {
    private fun profile(json: String) = Json.parseToJsonElement(json).jsonObject

    @Test
    fun `lists what the account lacks, conditions first`() {
        val offer = ProfileOffer.of(
            profile("""{"goals":["Sleep better"],"conditions":["Bad knee","High BP"],"preferences":["Mornings"]}"""),
            profile("""{"conditions":["High BP"]}"""),
        )!!
        assertEquals(listOf("Bad knee", "Goal: Sleep better", "Preference: Mornings"), offer.items)
        assertEquals(1, offer.health)
    }

    @Test
    fun `capitals and spacing are the same detail`() {
        assertNull(ProfileOffer.of(profile("""{"conditions":["  bad   KNEE "]}"""), profile("""{"conditions":["Bad knee"]}""")))
    }

    @Test
    fun `single details only when the account has none`() {
        val offer = ProfileOffer.of(profile("""{"name":"Device","prakriti":"Vata","experience":"experienced"}"""), profile("""{"name":"Account","prakriti":""}"""))!!
        assertEquals(listOf("Constitution: Vata", "Experience: Experienced"), offer.items)
    }

    @Test
    fun `Amrita's own notes alone don't ask`() {
        val device = profile("""{"observations":[{"date":"2026-10-31","note":"Slept well"}],"practiceHistory":[{"date":"2026-10-31","title":"Box","kind":"breathwork"}]}""")
        assertNull(ProfileOffer.of(device, profile("{}")))
    }

    @Test
    fun `nothing without a device copy or when nothing is missing`() {
        assertNull(ProfileOffer.of(null, profile("""{"conditions":["Bad knee"]}""")))
        assertNull(ProfileOffer.of(profile("""{"conditions":["Bad knee"]}"""), profile("""{"conditions":["Bad knee"],"goals":["More"]}""")))
    }

    @Test
    fun `the key ignores order`() {
        val a = ProfileOffer.of(profile("""{"conditions":["One","Two"]}"""), profile("{}"))!!
        val b = ProfileOffer.of(profile("""{"conditions":["two","one"]}"""), profile("{}"))!!
        assertEquals(a.key, b.key)
    }

    @Test
    fun `the summary names health details only when there are some`() {
        fun summary(json: String) = ProfileOffer.of(profile(json), profile("{}"))!!.summary
        assertEquals("This device has 1 health detail your account doesn't have.", summary("""{"conditions":["One"]}"""))
        assertEquals("This device has 2 health details your account doesn't have.", summary("""{"conditions":["One","Two"]}"""))
        assertEquals("This device has 1 detail your account doesn't have.", summary("""{"goals":["One"]}"""))
        assertEquals("This device has 2 details, including health details, your account doesn't have.", summary("""{"conditions":["One"],"goals":["Two"]}"""))
    }

    @Test
    fun `merge adds what's missing and changes nothing the account has`() {
        val merged = ProfileOffer.merge(
            profile("""{"name":"Device","conditions":["high bp","Bad knee"],"goals":["Sleep"],"prakriti":"Vata","prakritiConfidence":"low","experience":"regular"}"""),
            profile("""{"name":"Account","conditions":["High BP"],"prakriti":"Pitta","prakritiConfidence":"high","custom":"kept"}"""),
        )
        assertEquals(profile("""{"name":"Account","conditions":["High BP","Bad knee"],"prakriti":"Pitta","prakritiConfidence":"high","custom":"kept","goals":["Sleep"],"experience":"regular"}"""), merged)
    }

    @Test
    fun `merge brings Amrita's notes without repeats`() {
        val shared = """{"date":"2026-10-30","title":"Box","kind":"breathwork"}"""
        val added = """{"date":"2026-10-31","title":"Morning","kind":"ritual"}"""
        val merged = ProfileOffer.merge(profile("""{"practiceHistory":[$shared,$added]}"""), profile("""{"practiceHistory":[$shared]}"""))
        assertEquals(profile("""{"practiceHistory":[$shared,$added]}"""), merged)
    }

    @Test
    fun `merge stays within the server's limit`() {
        val many = JsonArray((0 until 60).map { JsonPrimitive("Account $it") })
        val merged = ProfileOffer.merge(profile("""{"conditions":["Extra"]}"""), JsonObject(mapOf("conditions" to many)))
        assertEquals(many, merged["conditions"])
    }

    @Test
    fun `nothing left to offer after merging`() {
        val device = profile("""{"conditions":["One"],"goals":["Two"],"name":"N","vikriti":"Vata","experience":"regular"}""")
        assertNull(ProfileOffer.of(device, ProfileOffer.merge(device, profile("""{"name":"Other"}"""))))
    }

    @Test
    fun `add saves on the version it read`() = runTest {
        val versions = mutableListOf<Int>()
        val stored = ProfileOffer.add(
            profile("""{"conditions":["Bad knee"]}"""),
            load = { VersionedProfile(profile("""{"goals":["Sleep"]}"""), 3) },
            save = { merged, version ->
                versions += version
                VersionedProfile(merged, version + 1)
            },
        )
        assertEquals(listOf(3), versions)
        assertEquals(profile("""{"goals":["Sleep"],"conditions":["Bad knee"]}"""), stored)
    }

    @Test
    fun `add retries once keeping the other device's change`() = runTest {
        val versions = mutableListOf<Int>()
        val stored = ProfileOffer.add(
            profile("""{"conditions":["Bad knee"]}"""),
            load = { VersionedProfile(profile("{}"), 3) },
            save = { merged, version ->
                versions += version
                if (version == 3) VersionedProfile(profile("""{"goals":["Theirs"]}"""), 4) else VersionedProfile(merged, version + 1)
            },
        )
        assertEquals(listOf(3, 4), versions)
        assertEquals(profile("""{"goals":["Theirs"],"conditions":["Bad knee"]}"""), stored)
    }

    @Test
    fun `add gives up after a second conflict`() = runTest {
        var saves = 0
        val stored = ProfileOffer.add(
            profile("""{"conditions":["Bad knee"]}"""),
            load = { VersionedProfile(profile("{}"), 1) },
            save = { _, _ ->
                saves++
                VersionedProfile(profile("{}"), 1 + saves)
            },
        )
        assertNull(stored)
        assertEquals(2, saves)
    }
}
