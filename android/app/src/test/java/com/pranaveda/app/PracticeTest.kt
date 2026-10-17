package com.pranaveda.app

import android.content.SharedPreferences
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AccountUser
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.auth.DeviceDescription
import com.pranaveda.app.auth.GoogleIdentityProvider
import com.pranaveda.app.auth.InMemorySessionStorage
import com.pranaveda.app.model.BreathworkPattern
import com.pranaveda.app.model.PracticeCalendar
import com.pranaveda.app.model.PracticeLog
import com.pranaveda.app.model.PracticeLogEntry
import com.pranaveda.app.model.PracticeStore
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.model.YogaPose
import com.pranaveda.app.model.YogaPractice
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.practice.BreathPacer
import com.pranaveda.app.practice.Guidance
import com.pranaveda.app.practice.PoseSequence
import com.pranaveda.app.practice.clockString
import com.pranaveda.app.practice.poseSeconds
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.util.Collections
import java.util.Locale

class PracticeEngineTest {
    @Test fun readsPoseDurationsAsTheWebsiteDoes() {
        assertEquals(120, poseSeconds("2 minutes"))
        assertEquals(60, poseSeconds("1 minute"))
        assertEquals(30, poseSeconds("5 breaths"))
        assertEquals(30, poseSeconds("30 seconds"))
        assertEquals(180, poseSeconds("Hold for 3 minutes"))
        assertEquals(120, poseSeconds("as long as feels good"))
        assertEquals(120, poseSeconds(null))
        assertEquals("1:05", clockString(65))
    }

    @Test fun movesThroughPosesCatchesUpAndFinishes() {
        val sequence = PoseSequence(listOf(60, 30))
        assertTrue(sequence.advance(59.5).isEmpty())
        assertEquals(1, sequence.secondsLeft)
        assertEquals(listOf(PoseSequence.Event.EnteredPose(1)), sequence.advance(0.5))
        assertEquals(listOf(PoseSequence.Event.Finished), sequence.advance(30.0))
        assertTrue(sequence.advance(5.0).isEmpty())

        val gap = PoseSequence(listOf(60, 30))
        assertEquals(listOf(PoseSequence.Event.EnteredPose(1), PoseSequence.Event.Finished), gap.advance(100.0))
    }

    @Test fun skipsForwardAndBack() {
        val sequence = PoseSequence(listOf(60, 30, 45))
        sequence.advance(20.0)
        assertTrue(sequence.previous().isEmpty())
        assertEquals(listOf(PoseSequence.Event.EnteredPose(1)), sequence.next())
        assertEquals(listOf(PoseSequence.Event.EnteredPose(0)), sequence.previous())
        assertEquals(60, sequence.secondsLeft)
    }

    @Test fun pacesBreathworkSkippingEmptyHolds() {
        val pacer = BreathPacer(BreathworkPattern(name = "Ocean Breath", inhale = 4.0, exhale = 6.0, cycles = 2))
        assertEquals(BreathPacer.Event.PhaseStarted(BreathPacer.Phase.Inhale, 4, 1), pacer.startEvent)
        assertEquals(listOf(BreathPacer.Event.PhaseStarted(BreathPacer.Phase.Exhale, 6, 1)), pacer.advance(4.0))
        assertEquals(listOf(BreathPacer.Event.PhaseStarted(BreathPacer.Phase.Inhale, 4, 2)), pacer.advance(6.0))
        assertEquals(listOf(BreathPacer.Event.PhaseStarted(BreathPacer.Phase.Exhale, 6, 2)), pacer.advance(9.0))
        assertEquals(listOf(BreathPacer.Event.Finished), pacer.advance(1.0))
        assertEquals(1, pacer.totalMinutes)

        val box = BreathPacer(BreathworkPattern(name = "Box", inhale = 4.0, holdActive = 4.0, exhale = 4.0, holdEmpty = 4.0, cycles = 6))
        assertEquals(3, box.advance(12.0).size) // hold, exhale and rest within 12 s: holds included
        assertEquals(2, box.totalMinutes)
    }

    @Test fun speaksTheWebsitesWords() {
        val warrior = YogaPose(nameEnglish = "Warrior II", nameSanskrit = "Virabhadrasana II", duration = "2 minutes", instructions = "Step wide. Bend the front knee.")
        assertEquals(
            """Starting posture: Warrior Two, or Virabhadrasana Two. <break time="1.2s" /> Step wide. <break time="1.4s" /> Bend the front knee.""",
            Guidance.startPose(warrior),
        )
        assertTrue(Guidance.enterPose(warrior).startsWith("Entering posture: Warrior Two."))
        assertEquals("Warrior Three", Guidance.speakableName("Warrior III"))
        assertEquals("Inversion Index", Guidance.speakableName("Inversion Index"))
        assertEquals("Breathe in", Guidance.cue(BreathPacer.Phase.Inhale, 4))
        assertEquals("Exhale slowly", Guidance.cue(BreathPacer.Phase.Exhale, 6))
        assertEquals("Rest in the quiet emptiness", Guidance.cue(BreathPacer.Phase.HoldEmpty, 8))
    }

    @Test fun turnsPauseMarkersIntoSilences() {
        val parts = Guidance.script("""Beautiful. <break time="0.8s" /> You've completed it. <break time="0.8s" /> Rest here.""")
        assertEquals(listOf("Beautiful.", "You've completed it.", "Rest here."), parts.map { it.words })
        assertEquals(listOf(0.8, 0.8, 0.0), parts.map { it.pauseAfter })
        val trailing = Guidance.script("""Hold. <break time="1.4s" /> <break time="1.2s" />""")
        assertEquals(listOf("Hold."), trailing.map { it.words })
        assertEquals(2.6, trailing.single().pauseAfter, 0.0001)
    }
}

class PracticeLogTest {
    private val pacific = ZoneId.of("America/Los_Angeles")
    private fun entry(id: String, localDate: String, completedAt: String = "${localDate}T18:00:00.000Z", result: RecommendationResult? = null) =
        PracticeLogEntry(id, PracticeLogEntry.Kind.Ritual, "Ritual $id", completedAt, localDate, 10, result)
    private val ritual = RecommendationResult(summary = "Evening", yogaPractice = YogaPractice(title = "Wind-down", durationMinutes = 10))

    @Test fun newEntriesLookLikeTheWebsitesAndFileUnderTheLocalDay() {
        // 9:30 pm in California is already the next day in UTC.
        val made = PracticeLog.newEntry(PracticeLogEntry.Kind.Breathwork, "Ocean Breath", 3, null, Instant.parse("2026-10-16T04:30:00Z"), pacific)
        assertEquals("2026-10-15", made.localDate)
        assertEquals("2026-10-16T04:30:00.000Z", made.completedAt)
        assertTrue(made.id.matches(Regex("""p_\d{13}_[a-z0-9]{5}""")))
        val json = PvJson.parseToJsonElement(PvJson.encodeToString(PracticeLogEntry.serializer(), made)).jsonObject
        assertEquals("breathwork", json["kind"]?.jsonPrimitive?.content)
        assertNull("no result is sent as absent", json["result"])
    }

    @Test fun keepsRitualSnapshotsOnlyOnTheNewestEntries() {
        val kept = PracticeLog.trimmed((0 until 45).map { entry("e$it", "2026-10-01", result = ritual) })
        assertTrue(kept.take(5).all { it.result == null })
        assertTrue(kept.takeLast(40).all { it.result != null })
        assertEquals(500, PracticeLog.trimmed((0 until 510).map { entry("x$it", "2026-10-01") }).size)
    }

    @Test fun mergesEntriesFromElsewhereOncePerIdInTimeOrder() {
        val local = listOf(entry("a", "2026-10-10"), entry("c", "2026-10-12"))
        val incoming = listOf(entry("b", "2026-10-11"), entry("a", "2026-10-10"))
        assertEquals(listOf("a", "b", "c"), PracticeLog.merged(local, incoming).map { it.id })
        assertEquals(local, PracticeLog.merged(local, listOf(local[0])))
    }

    @Test fun countsTheStreakBackFromTodayOrYesterday() {
        val today = LocalDate.parse("2026-10-15")
        val days = listOf("2026-10-12", "2026-10-13", "2026-10-14").map { entry(it, it) }
        assertEquals(3, PracticeLog.streak(days, today))
        assertEquals(4, PracticeLog.streak(days + entry("t", "2026-10-15"), today))
        assertEquals(0, PracticeLog.streak(listOf(entry("old", "2026-10-13")), today))
    }

    @Test fun readsEntriesFromOtherDevicesEvenWithAnUnfamiliarRitual() {
        val json = """[{"id":"p_1","kind":"ritual","title":"Morning","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14",
            "durationMinutes":10,"result":{"surprise":true},"heart":{"startBpm":70}},
           {"id":"p_2","kind":"breathwork","title":"Box","completedAt":"2026-10-14T16:00:00Z","localDate":"2026-10-14","durationMinutes":2}]"""
        val entries = PvJson.decodeFromString(ListSerializer(PracticeLogEntry.serializer()), json)
        assertEquals(listOf("p_1", "p_2"), entries.map { it.id })
        assertNull(entries[0].result)
        assertTrue(entries[1].completedInstant != null)
    }

    @Test fun laysOutTheMonthUnderItsWeekdays() {
        val october = YearMonth.of(2026, 10)
        val sundayFirst = PracticeCalendar(Locale.US, DayOfWeek.SUNDAY)
        val days = sundayFirst.days(october)
        assertEquals(31, days.size)
        assertEquals(LocalDate.parse("2026-10-01"), days.first())
        assertEquals(4, sundayFirst.leadingBlanks(october)) // 1 Oct 2026 is a Thursday
        assertEquals("Sunday", sundayFirst.weekdays.first().second)
        assertEquals(28, sundayFirst.days(YearMonth.of(2026, 2)).size)

        val mondayFirst = PracticeCalendar(Locale.UK, DayOfWeek.MONDAY)
        assertEquals(3, mondayFirst.leadingBlanks(october))
        assertEquals("Monday", mondayFirst.weekdays.first().second)
        assertEquals("Sunday", mondayFirst.weekdays.last().second)
    }

    @Test fun describesTheMonthAndDays() {
        val grid = PracticeCalendar(Locale.US, DayOfWeek.SUNDAY)
        val today = LocalDate.parse("2026-10-15")
        val entries = listOf(entry("a", "2026-10-15"), entry("b", "2026-10-15"), entry("c", "2026-10-12"))
        assertEquals(listOf("a", "b"), PracticeCalendar.byDay(entries)["2026-10-15"]?.map { it.id })
        assertEquals("4 practices this month · 3-day streak", PracticeCalendar.monthLine(4, 3))
        assertEquals("1 practice this month", PracticeCalendar.monthLine(1, 0))
        assertEquals("Thursday, October 15, today, 2 practices", grid.dayDescription(today, 2, today))
        assertEquals("Wednesday, October 14, no practice", grid.dayDescription(today.minusDays(1), 0, today))
        assertEquals("This day has not arrived yet.", PracticeCalendar.emptyDayLine(today.plusDays(1), today))
        assertTrue(PracticeCalendar.emptyDayLine(today, today).startsWith("Nothing practiced yet today."))
        assertEquals("No practice was recorded on this day.", PracticeCalendar.emptyDayLine(today.minusDays(14), today))
    }
}

/** SharedPreferences kept in memory, for tests. */
class MemoryPrefs : SharedPreferences {
    private val values = mutableMapOf<String, Any?>()
    override fun getAll(): Map<String, *> = values
    override fun getString(key: String, defValue: String?) = values[key] as String? ?: defValue
    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(key: String, defValues: Set<String>?) = values[key] as Set<String>? ?: defValues
    override fun getInt(key: String, defValue: Int) = values[key] as Int? ?: defValue
    override fun getLong(key: String, defValue: Long) = values[key] as Long? ?: defValue
    override fun getFloat(key: String, defValue: Float) = values[key] as Float? ?: defValue
    override fun getBoolean(key: String, defValue: Boolean) = values[key] as Boolean? ?: defValue
    override fun contains(key: String) = key in values
    override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}
    override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}
    override fun edit(): SharedPreferences.Editor = object : SharedPreferences.Editor {
        override fun putString(key: String, value: String?) = apply { values[key] = value }
        override fun putStringSet(key: String, value: Set<String>?) = apply { values[key] = value?.toSet() }
        override fun putInt(key: String, value: Int) = apply { values[key] = value }
        override fun putLong(key: String, value: Long) = apply { values[key] = value }
        override fun putFloat(key: String, value: Float) = apply { values[key] = value }
        override fun putBoolean(key: String, value: Boolean) = apply { values[key] = value }
        override fun remove(key: String) = apply { values.remove(key) }
        override fun clear() = apply { values.clear() }
        override fun commit() = true
        override fun apply() {}
    }
}

class PracticeStoreTest {
    private val server = MockWebServer()
    private val requests = Collections.synchronizedList(mutableListOf<RecordedRequest>())
    private val routes = mutableMapOf<String, (RecordedRequest) -> MockResponse>()
    private lateinit var api: ApiClient
    private val user = AccountUser(id = "u1", email = "meera@example.com", displayName = "Meera Shah")
    private val file = File.createTempFile("practice", ".json").also { it.delete() }

    private fun json(status: Int, body: String) = MockResponse.Builder().code(status).body(body).build()
    private val session = json(200, """{"accessToken":"access-1","refreshToken":"refresh-2","expiresIn":900}""")
    private fun path(r: RecordedRequest) = "${r.method} ${r.url.encodedPath}"

    @Before fun start() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                return routes[path(request)]?.invoke(request) ?: json(404, "{}")
            }
        }
        server.start()
        api = ApiClient(baseUrl = server.url("/"))
        routes["POST /api/auth/refresh"] = { session }
    }

    @After fun stop() {
        server.close()
        file.delete()
    }

    private fun auth() = AuthStore(
        AccountApi(api),
        InMemorySessionStorage(refreshToken = "refresh-1", user = user),
        object : GoogleIdentityProvider {
            override suspend fun idToken(context: android.content.Context, nonce: String) = error("unused")
            override suspend fun signOut() {}
        },
        device = { DeviceDescription("phone", "17", "Pixel", "0.1.0") },
    )

    private fun kotlinx.coroutines.test.TestScope.store(prefs: SharedPreferences = MemoryPrefs()) =
        PracticeStore(AccountApi(api), prefs, file, backgroundScope, UnconfinedTestDispatcher(testScheduler))

    @Test fun keepsTheLogAcrossLaunches() = runTest {
        store().log(PracticeLogEntry.Kind.Breathwork, "Ocean Breath", 3, null)
        assertEquals(listOf("Ocean Breath"), store().entries.map { it.title })
    }

    @Test fun uploadsThisPhonesPracticesAndReadsTheAccountsOnSignIn() = runTest {
        val fromWebsite = """{"id":"p_web","kind":"ritual","title":"From the website","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14","durationMinutes":12}"""
        routes["POST /api/sync/practice-log"] = { json(200, """{"stored":1}""") }
        routes["GET /api/sync/practice-log"] = { r ->
            if (r.url.queryParameter("after") == "0") json(200, """{"entries":[$fromWebsite],"cursor":7,"hasMore":false}""")
            else json(200, """{"entries":[],"cursor":7,"hasMore":false}""")
        }
        val prefs = MemoryPrefs()
        val store = store(prefs)
        store.auth = auth()
        val mine = store.log(PracticeLogEntry.Kind.Breathwork, "Ocean Breath", 3, null)

        store.adoptAccount(user)

        val upload = requests.first { path(it) == "POST /api/sync/practice-log" }
        assertEquals("Bearer access-1", upload.headers["Authorization"])
        val sent = PvJson.parseToJsonElement(upload.body!!.utf8()).jsonObject["entries"]!!.jsonArray
        assertEquals(listOf(mine.id), sent.map { it.jsonObject["id"]!!.jsonPrimitive.content })
        assertEquals(setOf(mine.id, "p_web"), store.entries.map { it.id }.toSet())
        assertEquals(7L, prefs.getLong("pranaveda_practice_cursor", 0))

        store.sync()
        assertEquals(1, requests.count { path(it) == "POST /api/sync/practice-log" })
        assertEquals("7", requests.last { path(it) == "GET /api/sync/practice-log" }.url.queryParameter("after"))
    }

    @Test fun uploadsInBatchesOfTheServersLimit() = runTest {
        routes["POST /api/sync/practice-log"] = { json(200, """{"stored":25}""") }
        routes["GET /api/sync/practice-log"] = { json(200, """{"entries":[],"cursor":0,"hasMore":false}""") }
        val store = store()
        repeat(30) { store.log(PracticeLogEntry.Kind.Breathwork, "Breath $it", 1, null) }
        store.auth = auth()
        store.adoptAccount(user)
        val sizes = requests.filter { path(it) == "POST /api/sync/practice-log" }
            .map { PvJson.parseToJsonElement(it.body!!.utf8()).jsonObject["entries"]!!.jsonArray.size }
        assertEquals(listOf(25, 5), sizes)
    }

    @Test fun handsBackOnlyThisPhonesOwnPracticesOnSignOut() = runTest {
        routes["POST /api/sync/practice-log"] = { json(200, """{"stored":1}""") }
        routes["GET /api/sync/practice-log"] = {
            json(200, """{"entries":[{"id":"p_web","kind":"ritual","title":"From the website","completedAt":"2026-10-14T15:00:00.000Z","localDate":"2026-10-14","durationMinutes":12}],"cursor":3,"hasMore":false}""")
        }
        val prefs = MemoryPrefs()
        val store = store(prefs)
        store.auth = auth()
        val mine = store.log(PracticeLogEntry.Kind.Breathwork, "Before sign-in", 3, null)
        store.adoptAccount(user)
        assertEquals(2, store.entries.size)

        store.handBackDevice()

        assertEquals(listOf(mine.id), store.entries.map { it.id })
        assertNull(prefs.getString("pranaveda_practice_owner", null))
    }

    @Test fun keepsAPracticeThatNeverReachedTheAccount() = runTest {
        // Offline the whole time (only sign-in refresh answers).
        val store = store()
        store.auth = auth()
        store.adoptAccount(user)
        store.log(PracticeLogEntry.Kind.Ritual, "Offline ritual", 10, null)
        store.sync()
        store.handBackDevice()
        assertEquals(listOf("Offline ritual"), store.entries.map { it.title })
    }

    @Test fun nothingIsSentWhileSignedOut() = runTest {
        val store = store()
        store.log(PracticeLogEntry.Kind.Breathwork, "Guest breath", 1, null)
        store.sync()
        assertTrue(requests.isEmpty())
    }
}
