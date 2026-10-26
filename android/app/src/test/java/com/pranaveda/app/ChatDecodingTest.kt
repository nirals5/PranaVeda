package com.pranaveda.app

import com.pranaveda.app.config.AppConfig
import com.pranaveda.app.model.BreathworkPattern
import com.pranaveda.app.model.ChatCard
import com.pranaveda.app.model.ChatItem
import com.pranaveda.app.model.Principle
import com.pranaveda.app.model.cautions
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.net.ChatEvent
import com.pranaveda.app.ui.chat.inlineMarkdown
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatDecodingTest {
    @Test fun decodesTextProfileErrorAndDoneEvents() {
        assertEquals(ChatEvent.Text("Breathe"), ApiClient.decodeEvent("""{"type":"text","delta":"Breathe"}"""))

        val profile = ApiClient.decodeEvent("""{"type":"profile","profile":{"name":"Meera","goals":["rest"],"futureField":{"a":1}}}""")
        assertTrue(profile is ChatEvent.Profile)
        profile as ChatEvent.Profile
        assertEquals("Meera", profile.profile["name"]?.jsonPrimitive?.content)
        assertNotNull("unknown fields survive", profile.profile["futureField"])

        assertEquals(ChatEvent.Error("Rate limited"), ApiClient.decodeEvent("""{"type":"error","message":"Rate limited"}"""))
        assertEquals(ChatEvent.Done, ApiClient.decodeEvent("""{"type":"done"}"""))
        assertNull(ApiClient.decodeEvent("not json"))
        assertNull(ApiClient.decodeEvent("""{"type":"something_new"}"""))
    }

    @Test fun decodesCautionNotesWhenTheServerSendsThem() {
        val json = """
        {"type":"card","card":{"kind":"ritual","result":{
          "yogaPractice":{"title":"Steady","poses":[
            {"poseId":"warrior_1","nameEnglish":"Warrior I","caution":"High blood pressure: keep arms down."},
            {"poseId":"tadasana","nameEnglish":"Mountain Pose"}]},
          "breathwork":{"name":"Equal Breathing","inhale":4,"holdActive":0,"exhale":4,"holdEmpty":0,"cycles":6,"caution":"Asthma: keep the holds short."}}}}
        """.trimIndent().replace("\n", "")
        val event = ApiClient.decodeEvent(json) as ChatEvent.Card
        val result = (event.card as ChatCard.Ritual).result
        assertEquals("High blood pressure: keep arms down.", result.yogaPractice.poses[0].caution)
        assertNull(result.yogaPractice.poses[1].caution)
        assertEquals(listOf("Warrior I", "Equal Breathing"), result.cautions.map { it.first })
    }

    @Test fun decodesTheCitedPrinciple() {
        val ritual = ApiClient.decodeEvent(
            """{"type":"card","card":{"kind":"ritual","result":{"principle":{"id":"PR4","statement":"Like increases like."},"yogaPractice":{"title":"Settle","poses":[]}}}}""",
        ) as ChatEvent.Card
        assertEquals(Principle("PR4", "Like increases like."), (ritual.card as ChatCard.Ritual).result.principle)

        val breath = ApiClient.decodeEvent(
            """{"type":"card","card":{"kind":"breathwork","principle":{"id":"PR12","statement":"Cooling breaths reduce heat."},"pattern":{"name":"Cooling Breath","inhale":4,"exhale":6,"cycles":8}}}""",
        ) as ChatEvent.Card
        assertEquals("PR12", (breath.card as ChatCard.Breathwork).principle?.id)

        // Older servers send none, and a malformed one is ignored rather than losing the card.
        val malformed = ApiClient.decodeEvent(
            """{"type":"card","card":{"kind":"breathwork","principle":"PR4","pattern":{"name":"Ocean Breath","inhale":4,"exhale":6,"cycles":8}}}""",
        ) as ChatEvent.Card
        assertNull((malformed.card as ChatCard.Breathwork).principle)
    }

    @Test fun catalogMarksExperiencedOnlyPoses() {
        val catalog = com.pranaveda.app.model.PvJson.decodeFromString(
            com.pranaveda.app.model.Catalog.serializer(),
            """{"poses":[
              {"id":"warrior_3","nameSanskrit":"Virabhadrasana III","nameEnglish":"Warrior III","level":"Intermediate","bodyFocus":"Balance","benefits":"x","minExperience":"experienced"},
              {"id":"tadasana","nameSanskrit":"Tadasana","nameEnglish":"Mountain Pose","level":"Beginner","bodyFocus":"Posture","benefits":"x"}],
             "breathwork":[]}""",
        )
        assertEquals(listOf(true, false), catalog.poses.map { it.experiencedOnly })
    }

    @Test fun decodesARitualCardAsTheServerSendsIt() {
        val json = """
        {"type":"card","card":{"kind":"ritual","result":{
          "summary":"For a restless evening","doshaTendency":"Vata","primaryEnergy":"Scattered Wind",
          "yogaPractice":{"title":"Evening wind-down","description":"Slow","durationMinutes":12,"poses":[
            {"poseId":"triangle","nameEnglish":"Triangle Pose","nameSanskrit":"Trikonasana","duration":"2 minutes",
             "benefits":"Opens","instructions":"Reach.","poseImageUrl":"/poses/triangle.jpg",
             "sceneImageUrl":"/poses_with_background/web/triangle_wide.webp"},
            {"poseId":"tadasana","nameEnglish":"Equal Standing Pose","nameSanskrit":"Tadasana","duration":"1 minute",
             "benefits":"Grounds","instructions":"Stand.","poseImageUrl":"https://images.unsplash.com/photo-1"}]},
          "ayurvedicAdvice":{"assessment":"x","doshaPrimary":"Vata","dietaryTips":[],"lifestyleTips":[],"recommendedHerbs":[]},
          "breathwork":{"name":"Equal Breathing","sanskritName":"Sama Vritti","description":"Even","inhale":4,"holdActive":4,"exhale":4,"holdEmpty":4,"cycles":6,"benefits":"Calm"},
          "lifestyleTips":[]}}}
        """
        val event = ApiClient.decodeEvent(json) as ChatEvent.Card
        val result = (event.card as ChatCard.Ritual).result
        assertEquals("Evening wind-down", result.yogaPractice.title)
        assertEquals(2, result.yogaPractice.poses.size)
        assertEquals("In 4 · hold 4 · out 4 · rest 4", result.breathwork?.rhythm)

        val base = "http://localhost:3000".toHttpUrl()
        val (triangle, tadasana) = result.yogaPractice.poses
        assertEquals(
            "http://localhost:3000/poses_with_background/web/triangle_wide.webp",
            AppConfig.resolve(triangle.sceneImageUrl ?: triangle.poseImageUrl, base),
        )
        assertEquals("https://images.unsplash.com/photo-1", AppConfig.resolve(tadasana.sceneImageUrl ?: tadasana.poseImageUrl, base))
    }

    @Test fun decodesOptionsBreathworkAndDoshaCards() {
        val options = (ApiClient.decodeEvent("""{"type":"card","card":{"kind":"options","options":[{"label":"Calm","emoji":"🌙"},{"label":"Energise"}]}}""") as ChatEvent.Card).card
        assertEquals(listOf("Calm", "Energise"), (options as ChatCard.Options).options.map { it.label })

        val breath = (ApiClient.decodeEvent("""{"type":"card","card":{"kind":"breathwork","note":"Before bed","pattern":{"name":"Ocean Breath","inhale":4,"holdActive":0,"exhale":6,"holdEmpty":0,"cycles":8}}}""") as ChatEvent.Card).card
        breath as ChatCard.Breathwork
        assertEquals("Before bed", breath.note)
        assertEquals("In 4 · out 6", breath.pattern.rhythm)

        val dosha = (ApiClient.decodeEvent("""{"type":"card","card":{"kind":"dosha_profile","primary":"Vata","secondary":"Pitta","balance":{"vata":50,"pitta":30,"kapha":20},"essence":"Airy","explanation":"…","guidance":[],"confidence":"medium"}}""") as ChatEvent.Card).card
        dosha as ChatCard.DoshaProfile
        assertEquals("Vata", dosha.profile.primary)
        assertEquals(20.0, dosha.profile.balance.kapha, 0.0)
    }

    @Test fun showsNothingForACardKindItDoesNotKnow() {
        val card = (ApiClient.decodeEvent("""{"type":"card","card":{"kind":"video_session","url":"x"}}""") as ChatEvent.Card).card
        assertEquals(ChatCard.Unsupported("video_session"), card)
    }

    @Test fun dropsAKnownCardThatIsMalformed() {
        assertNull(ApiClient.decodeEvent("""{"type":"card","card":{"kind":"ritual","result":{"summary":"no practice"}}}"""))
    }

    @Test fun describesCardOnlyTurnsToAmritaTheWayTheWebAppDoes() {
        val pattern = BreathworkPattern(name = "Ocean Breath", inhale = 4.0, exhale = 6.0, cycles = 8)
        val item = ChatItem(ChatItem.Role.Assistant, cards = listOf(ChatCard.Breathwork(null, pattern)))
        assertEquals("[Presented: Ocean Breath]", item.modelContent)
        assertEquals("Hello", ChatItem(ChatItem.Role.Assistant, text = "Hello").modelContent)
    }

    @Test fun resolvesOnlySitePathsAgainstTheApi() {
        val base = "https://pranaveda.example".toHttpUrl()
        assertEquals("https://pranaveda.example/poses/cobra.jpg", AppConfig.resolve("/poses/cobra.jpg", base))
        assertEquals("https://cdn.example/a.webp", AppConfig.resolve("https://cdn.example/a.webp", base))
        assertNull(AppConfig.resolve(null, base))
        assertNull(AppConfig.resolve("", base))
    }

    @Test fun knowsWhichApiAddressesAreOnTheLocalNetwork() {
        for (host in listOf("10.0.2.2", "localhost", "Hetans-Mac.local", "192.168.1.20", "172.16.0.4")) {
            assertTrue(host, AppConfig.isLocalHost(host))
        }
        for (host in listOf("pranaveda.app", "172.32.0.1", "8.8.8.8", "localhost.example.com")) {
            assertFalse(host, AppConfig.isLocalHost(host))
        }
    }

    @Test fun rendersBoldAndItalicMarkdown() {
        val text = inlineMarkdown("Breathe **slowly** and *softly*, 3 * 4")
        assertEquals("Breathe slowly and softly, 3 * 4", text.text)
        assertEquals(2, text.spanStyles.size)
    }
}
