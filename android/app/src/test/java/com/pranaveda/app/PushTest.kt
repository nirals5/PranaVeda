package com.pranaveda.app

import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.calendar.BusyInterval
import com.pranaveda.app.calendar.CalendarStore
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.push.CalendarUpload
import com.pranaveda.app.push.PushNudges
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Free-time nudges sent by the server through Firebase Cloud Messaging (KAN-31). */
class PushTest {
    private val server = MockWebServer().also { it.start() }
    private val api = AccountApi(ApiClient(baseUrl = server.baseUrl()))
    private val token = "fcm:APA91b" + "Ab_9-".repeat(30)

    @After fun stop() = server.close()

    private fun ok() = MockResponse.Builder().code(200).addHeader("Content-Type", "application/json").body("""{"ok":true}""").build()

    @Test fun aServerNudgeIsKnownByWhereItOpens() {
        assertTrue(PushNudges.isServerNudge(mapOf("title" to "Amrita", "body" to "x", "url" to "/?nudge=1")))
        assertFalse(PushNudges.isServerNudge(mapOf("title" to "Amrita", "body" to "x")))
        assertFalse(PushNudges.isServerNudge(mapOf("url" to "/practice")))
    }

    @Test fun theServerGetsBusyTimesOnlyAndNothingFromAnUnreadCalendar() {
        val zone = ZoneId.of("America/Los_Angeles")
        val now = Instant.parse("2026-11-23T22:00:00Z")
        val busy = listOf(BusyInterval(now.plusSeconds(3600), now.plusSeconds(7200)))

        val read = PvJson.parseToJsonElement(PvJson.encodeToString(CalendarUpload.serializer(), PushNudges.calendarUpload(true, busy, now, zone))).jsonObject
        val twoDays = LocalDate.of(2026, 11, 25).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(
            PvJson.parseToJsonElement("""{"trusted":true,"google":false,"busy":[[${now.toEpochMilli() + 3_600_000},${now.toEpochMilli() + 7_200_000}]],"coveredUntil":$twoDays}"""),
            read,
        )

        val unread = PvJson.encodeToString(CalendarUpload.serializer(), PushNudges.calendarUpload(false, busy, now, zone))
        assertEquals(PvJson.parseToJsonElement("""{"trusted":false,"google":false}"""), PvJson.parseToJsonElement(unread))
    }

    @Test fun thePhoneRegistersAsAnAndroidPhoneAndRemovesItsTokenOnSignOut() = runTest {
        server.enqueue(ok())
        server.enqueue(ok())
        server.enqueue(ok())

        api.registerPushToken(token, accessToken = "access-1")
        val put = server.takeRequest()
        assertEquals("PUT /api/push/device", "${put.method} ${put.url.encodedPath}")
        assertEquals("Bearer access-1", put.headers["Authorization"])
        assertEquals(PvJson.parseToJsonElement("""{"platform":"android","token":"$token"}"""), PvJson.parseToJsonElement(put.body!!.utf8()))

        api.sendPushState(seen = true, calendar = CalendarUpload(trusted = false, google = false), accessToken = "access-1")
        val state = server.takeRequest()
        assertEquals("PUT /api/push/state", "${state.method} ${state.url.encodedPath}")
        assertEquals(PvJson.parseToJsonElement("""{"seen":true,"calendar":{"trusted":false,"google":false}}"""), PvJson.parseToJsonElement(state.body!!.utf8()))

        api.forgetPushToken(token, accessToken = "access-1")
        val delete = server.takeRequest()
        assertEquals("DELETE /api/push/device", "${delete.method} ${delete.url.encodedPath}")
        assertEquals(PvJson.parseToJsonElement("""{"token":"$token"}"""), PvJson.parseToJsonElement(delete.body!!.utf8()))
    }

    @Test fun aRefusedRegistrationIsAnError() = runTest {
        server.enqueue(MockResponse.Builder().code(400).body("""{"error":"invalid_token"}""").build())
        assertTrue(runCatching { api.registerPushToken(token, accessToken = "access-1") }.isFailure)
    }

    @Test fun thePhonePlansNoFreeTimeRemindersWhileTheServerSendsThem() {
        assertTrue(CalendarStore.phonePlansReminders(enabled = true, remindersOn = true, serverNudges = false))
        assertFalse(CalendarStore.phonePlansReminders(enabled = true, remindersOn = true, serverNudges = true))
        assertFalse(CalendarStore.phonePlansReminders(enabled = true, remindersOn = false, serverNudges = false))
        assertFalse(CalendarStore.phonePlansReminders(enabled = false, remindersOn = true, serverNudges = false))
    }
}
