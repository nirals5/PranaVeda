package com.pranaveda.app

import java.util.Collections
import org.junit.Before
import org.junit.Assert.assertNull
import org.junit.After
import mockwebserver3.RecordedRequest
import mockwebserver3.MockWebServer
import mockwebserver3.MockResponse
import mockwebserver3.Dispatcher
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.TestScope
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.auth.InMemorySessionStorage
import com.pranaveda.app.auth.GoogleIdentityProvider
import com.pranaveda.app.auth.DeviceDescription
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.auth.AccountUser
import com.pranaveda.app.auth.AccountApi
import android.content.SharedPreferences
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.model.SavedRitual
import com.pranaveda.app.model.SavedRitualStore
import com.pranaveda.app.model.YogaPractice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

class SavedRitualsTest {
    private fun ritual(title: String) = RecommendationResult(
        summary = "For $title",
        primaryEnergy = "Scattered Wind",
        yogaPractice = YogaPractice(title = title, poses = emptyList(), durationMinutes = 10),
    )

    // Writes happen at once on the test thread, so a reopened store reads them.
    private val dispatcher = UnconfinedTestDispatcher()
    private val scope = CoroutineScope(dispatcher)

    private fun freshStore(file: File = File.createTempFile("saved", ".json").also { it.delete() }) =
        SavedRitualStore(file, scope, MemoryPrefs(), writer = dispatcher) to file

    @Test fun savesNewestFirstAndKeepsThemAcrossLaunches() {
        val (store, file) = freshStore()
        val now = Instant.parse("2026-10-17T18:00:00Z")
        assertTrue(store.toggle(ritual("Morning"), now))
        assertTrue(store.toggle(ritual("Evening"), now.plusSeconds(60)))
        assertEquals(listOf("Evening", "Morning"), store.rituals.map { it.title })
        assertTrue(store.rituals.first().id.startsWith("save_${now.toEpochMilli() + 60_000}_"))
        assertTrue(store.isSaved(ritual("Morning")))
        assertFalse(store.isSaved(ritual("Midday")))
        assertEquals(listOf("Evening", "Morning"), SavedRitualStore(file, scope, MemoryPrefs(), writer = dispatcher).rituals.map { it.title })
    }

    @Test fun savingTheSameRitualAgainRemovesIt() {
        val (store, _) = freshStore()
        store.toggle(ritual("Morning"))
        assertFalse(store.toggle(ritual("Morning")))
        assertTrue(store.rituals.isEmpty())
    }

    @Test fun removesOneEvenWhenSavedInTheSameMillisecond() {
        val (store, file) = freshStore()
        val now = Instant.parse("2026-10-17T18:00:00Z")
        store.toggle(ritual("Morning"), now)
        store.toggle(ritual("Evening"), now)
        store.remove(store.rituals[0])
        assertEquals(listOf("Morning"), store.rituals.map { it.title })
        assertEquals(listOf("Morning"), SavedRitualStore(file, scope, MemoryPrefs(), writer = dispatcher).rituals.map { it.title })
    }

    private fun saved(id: String) = SavedRitual(id, id, "Oct 17", "", "Yoga", RecommendationResult(yogaPractice = YogaPractice(title = id)))

    @Test fun addsWhatWasSavedElsewhereAndDropsWhatWasRemovedElsewhere() {
        val a = saved("save_1760000000001")
        val b = saved("save_1760000000002")
        val c = saved("save_1760000000003_ab12c")
        val (list, synced) = SavedRitualStore.reconcile(listOf(a, b), listOf(c, b), setOf(a.id, b.id), emptySet())
        assertEquals(listOf(c.id, b.id), list.map { it.id })
        assertEquals(setOf(b.id, c.id), synced.toSet())
        // Not yet uploaded: kept.
        assertEquals(listOf(c.id, b.id, a.id), SavedRitualStore.reconcile(listOf(a, c), listOf(b), setOf(b.id), emptySet()).first.map { it.id })
        // Just removed here: not brought back.
        val removed = SavedRitualStore.reconcile(emptyList(), listOf(b), setOf(b.id), setOf(b.id))
        assertTrue(removed.first.isEmpty() && removed.second.isEmpty())
        assertEquals(1760000000003, SavedRitualStore.savedMillis("save_1760000000003_ab12c"))
        assertEquals(0, SavedRitualStore.savedMillis("something"))
    }

    @Test fun readsTheWebsitesShape() {
        val json = """[{"id":"temp_1","title":"Grounding","date":"Oct 12","query":"I feel scattered","category":"Yoga",
            "result":{"summary":"s","yogaPractice":{"title":"Grounding","poses":[]}}}]"""
        val saved = PvJson.decodeFromString(ListSerializer(SavedRitual.serializer()), json)
        assertEquals("I feel scattered", saved.first().query)
        assertEquals("Oct 17", SavedRitualStore.savedDate(Instant.parse("2026-10-17T18:00:00Z"), ZoneId.of("America/Los_Angeles"), Locale.US))
    }
}

/** Saved-ritual sync against a stand-in server that keeps the account's list as the real one does. */
class SavedRitualSyncTest {
    private val server = MockWebServer()
    private val requests = Collections.synchronizedList(mutableListOf<RecordedRequest>())
    private val account = linkedMapOf<String, JsonObject>()
    private val removed = mutableSetOf<String>()
    private lateinit var api: ApiClient
    private val user = AccountUser(id = "u1", email = "meera@example.com", displayName = "Meera Shah")
    private val fromWebsite = """{"id":"save_1760000000009","title":"From the website","date":"Oct 12","query":"I feel heavy","category":"Yoga","result":{"summary":"s","yogaPractice":{"title":"From the website","poses":[]}}}"""

    private fun json(status: Int, body: String) = MockResponse.Builder().code(status).body(body).build()

    private fun add(ritual: JsonObject) {
        val id = ritual["id"]!!.jsonPrimitive.content
        if (id in account || id in removed) return
        val newest = linkedMapOf(id to ritual).apply { putAll(account) }
        account.clear()
        account.putAll(newest)
    }

    @Before fun start() {
        add(PvJson.parseToJsonElement(fromWebsite).jsonObject)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                return when ("${request.method} ${request.url.encodedPath}") {
                    "POST /api/auth/refresh" -> json(200, """{"accessToken":"access-1","refreshToken":"refresh-2","expiresIn":900}""")
                    "POST /api/sync/saved-rituals" -> {
                        val body = PvJson.parseToJsonElement(request.body!!.utf8()).jsonObject
                        body["removes"]?.jsonArray?.forEach { val id = it.jsonPrimitive.content; removed += id; account.remove(id) }
                        body["saves"]?.jsonArray?.forEach { add(it.jsonObject) }
                        json(200, """{"stored":0,"removed":0}""")
                    }
                    "GET /api/sync/saved-rituals" -> json(200, """{"rituals":[${account.values.joinToString(",")}]}""")
                    else -> json(404, "{}")
                }
            }
        }
        server.start()
        api = ApiClient(baseUrl = server.baseUrl())
    }

    @After fun stop() = server.close()

    private fun auth() = AuthStore(
        AccountApi(api),
        InMemorySessionStorage(refreshToken = "refresh-1", user = user),
        object : GoogleIdentityProvider {
            override suspend fun idToken(context: android.content.Context, nonce: String) = error("unused")
            override suspend fun signOut() {}
        },
        device = { DeviceDescription("phone", "17", "Pixel", "0.1.0") },
    )

    private fun ritual(title: String) = RecommendationResult(summary = title, yogaPractice = YogaPractice(title = title, durationMinutes = 10))

    private fun TestScope.store(prefs: SharedPreferences = MemoryPrefs()) = SavedRitualStore(
        File.createTempFile("saved", ".json").also { it.delete() }, backgroundScope, prefs, AccountApi(api), UnconfinedTestDispatcher(testScheduler),
    )

    @Test fun uploadsThisPhonesRitualsReadsTheAccountsAndSendsRemovals() = runTest {
        val store = store()
        store.toggle(ritual("Morning"))
        val mine = store.rituals.first()
        store.auth = auth()

        store.adoptAccount(user)
        val upload = requests.first { it.method == "POST" && it.url.encodedPath == "/api/sync/saved-rituals" }
        assertEquals("Bearer access-1", upload.headers["Authorization"])
        assertEquals(setOf(mine.id, "save_1760000000009"), store.rituals.map { it.id }.toSet())

        // Removed on this phone: the account is told, and it is not brought back.
        store.remove(store.rituals.first { it.id == "save_1760000000009" })
        store.sync()
        assertEquals(setOf("save_1760000000009"), removed)
        assertEquals(listOf(mine.id), store.rituals.map { it.id })

        // Removed on another device: it leaves this phone too.
        account.remove(mine.id)
        store.sync()
        assertTrue(store.rituals.isEmpty())
    }

    @Test fun handsBackOnlyThisPhonesOwnRitualsOnSignOut() = runTest {
        val prefs = MemoryPrefs()
        val store = store(prefs)
        store.toggle(ritual("Before sign-in"))
        val mine = store.rituals.first()
        store.auth = auth()
        store.adoptAccount(user)
        assertEquals(2, store.rituals.size)
        store.handBackDevice()
        assertEquals(listOf(mine.id), store.rituals.map { it.id })
        assertNull(prefs.getString("pranaveda_saved_owner", null))
    }

    @Test fun nothingIsSentWhileSignedOut() = runTest {
        val store = store()
        store.toggle(ritual("Guest"))
        store.remove(store.rituals.first())
        store.sync()
        assertTrue(requests.isEmpty())
    }
}
