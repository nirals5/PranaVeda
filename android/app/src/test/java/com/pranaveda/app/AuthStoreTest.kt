package com.pranaveda.app

import android.content.Context
import android.content.ContextWrapper
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AccountUser
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.auth.DeviceDescription
import com.pranaveda.app.auth.GoogleIdentityProvider
import com.pranaveda.app.auth.InMemorySessionStorage
import com.pranaveda.app.auth.SignInCancelled
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.net.ChatMessage
import com.pranaveda.app.net.ChatRequest
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Collections

/** Sign-in against a stand-in server that answers like api/auth.ts. */
class AuthStoreTest {
    private val server = MockWebServer()
    private val requests = Collections.synchronizedList(mutableListOf<RecordedRequest>())
    private val routes = mutableMapOf<String, () -> MockResponse>()
    private lateinit var api: ApiClient
    private val activity: Context = ContextWrapper(null)

    private val meera = AccountUser(id = "u1", email = "meera@example.com", displayName = "Meera Shah")
    private val device = DeviceDescription("phone", "17", "Google Pixel 9", "0.1.0")

    private class FakeGoogle(var result: () -> String = { "google-id-token" }) : GoogleIdentityProvider {
        var signedOut = 0
        var lastNonce: String? = null
        override suspend fun idToken(context: Context, nonce: String): String {
            lastNonce = nonce
            return result()
        }
        override suspend fun signOut() {
            signedOut++
        }
    }

    private fun json(status: Int, body: String) =
        MockResponse.Builder().code(status).addHeader("Content-Type", "application/json").body(body).build()

    private fun session(access: String, refresh: String, withUser: Boolean = true) = json(
        200,
        """{${if (withUser) """"user":{"id":"u1","email":"meera@example.com","displayName":"Meera Shah"},""" else ""}
           "accessToken":"$access","refreshToken":"$refresh","expiresIn":900}""",
    )

    @Before fun start() {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                return routes["${request.method} ${request.url.encodedPath}"]?.invoke() ?: json(404, "{}")
            }
        }
        server.start()
        api = ApiClient(baseUrl = server.baseUrl())
        routes["GET /api/auth/nonce"] = { json(200, """{"nonce":"n-123"}""") }
    }

    @After fun stop() = server.close()

    private fun store(storage: InMemorySessionStorage = InMemorySessionStorage(), google: FakeGoogle = FakeGoogle(), clock: () -> Long = { 1_000_000L }) =
        AuthStore(AccountApi(api), storage, google, device = { device }, now = clock)

    private fun bodyOf(request: RecordedRequest) = PvJson.parseToJsonElement(request.body!!.utf8()).jsonObject
    private fun path(request: RecordedRequest) = "${request.method} ${request.url.encodedPath}"

    @Test fun setsAndClearsExperienceOnTheAccount() = runTest {
        routes["POST /api/sync/profile/experience"] = { json(200, """{"profile":{"name":"Meera","experience":"experienced"},"version":4}""") }
        val saved = AccountApi(api).saveAccountExperience("experienced", accessToken = "access-1")
        assertEquals("experienced", saved.profile["experience"]?.jsonPrimitive?.content)
        val set = requests.last { path(it) == "POST /api/sync/profile/experience" }
        assertEquals("Bearer access-1", set.headers["Authorization"])
        assertEquals("experienced", bodyOf(set)["experience"]?.jsonPrimitive?.content)

        AccountApi(api).saveAccountExperience(null, accessToken = "access-1")
        // Clearing sends an explicit null, which the server needs.
        assertEquals("null", bodyOf(requests.last()).getValue("experience").toString())
    }

    @Test fun signsInWithGoogleAndKeepsTheSession() = runTest {
        routes["POST /api/auth/google"] = { session("access-1", "refresh-1") }
        val storage = InMemorySessionStorage()
        val google = FakeGoogle()
        val auth = store(storage, google)
        var signedInAs: AccountUser? = null
        auth.onSignedIn = { signedInAs = it }

        auth.signInWithGoogle(activity)

        assertEquals(meera, auth.user)
        assertEquals(meera, signedInAs)
        assertNull(auth.problem)
        assertEquals("refresh-1", storage.refreshToken)
        assertEquals(meera, storage.user)
        assertEquals("the server's nonce goes to Google", "n-123", google.lastNonce)
        assertEquals("a fresh token is used without refreshing", "access-1", auth.validAccessToken())

        val sent = bodyOf(requests.single { path(it) == "POST /api/auth/google" })
        assertEquals("google-id-token", sent["credential"]?.jsonPrimitive?.content)
        assertEquals("n-123", sent["nonce"]?.jsonPrimitive?.content)
        assertEquals("android", sent["client"]?.jsonPrimitive?.content)
        assertEquals("Google Pixel 9", sent["device"]?.jsonObject?.get("deviceModel")?.jsonPrimitive?.content)
        assertEquals("phone", sent["device"]?.jsonObject?.get("deviceClass")?.jsonPrimitive?.content)
    }

    @Test fun explainsWhenTheEmailAlreadyHasAnAccount() = runTest {
        routes["POST /api/auth/google"] = { json(409, """{"error":"account_exists","provider":"apple"}""") }
        val auth = store()
        auth.signInWithGoogle(activity)
        assertFalse(auth.isSignedIn)
        assertEquals("This email already has a PranaVeda account. Please continue with Apple instead.", auth.problem)
    }

    @Test fun closingGooglesSheetIsNotAnError() = runTest {
        val auth = store(google = FakeGoogle { throw SignInCancelled() })
        auth.signInWithGoogle(activity)
        assertFalse(auth.isSignedIn)
        assertNull(auth.problem)
        assertFalse(auth.isBusy)
    }

    @Test fun aStoredSessionShowsAsSignedInAndRefreshesOnlyWhenNeeded() = runTest {
        var time = 1_000_000L
        routes["POST /api/auth/refresh"] = { session("access-2", "refresh-2", withUser = false) }
        val storage = InMemorySessionStorage(refreshToken = "refresh-1", user = meera)
        val auth = store(storage, clock = { time })
        assertEquals("signed in straight away, even offline", meera, auth.user)

        var restored = 0
        auth.onSignedIn = { restored++ }
        auth.restore()
        auth.restore()
        assertEquals("restored once per launch", 1, restored)
        assertEquals("refresh-2", storage.refreshToken)
        assertEquals("android", bodyOf(requests.single { path(it) == "POST /api/auth/refresh" })["client"]?.jsonPrimitive?.content)

        assertEquals("access-2", auth.validAccessToken())
        assertEquals("no refresh while the token is fresh", 1, requests.count { path(it) == "POST /api/auth/refresh" })

        time += 900_000 // 15 minutes later
        auth.validAccessToken()
        assertEquals("refreshes once it has expired", 2, requests.count { path(it) == "POST /api/auth/refresh" })
    }

    @Test fun simultaneousRefreshesMakeOneRequest() = runTest {
        // Refresh tokens are single-use: a second request with the same one
        // would be treated as reuse and end the session.
        routes["POST /api/auth/refresh"] = { Thread.sleep(200); session("access-2", "refresh-2", withUser = false) }
        val auth = store(InMemorySessionStorage(refreshToken = "refresh-1", user = meera))
        val tokens = (1..3).map { async { auth.validAccessToken() } }.awaitAll()
        assertEquals(listOf("access-2", "access-2", "access-2"), tokens)
        assertEquals(1, requests.count { path(it) == "POST /api/auth/refresh" })
    }

    @Test fun anEndedSessionSignsOutAndClearsTheStoredSession() = runTest {
        routes["POST /api/auth/refresh"] = { json(401, """{"error":"invalid_refresh_token"}""") }
        val storage = InMemorySessionStorage(refreshToken = "refresh-1", user = meera)
        val google = FakeGoogle()
        val auth = store(storage, google)
        var signedOut = 0
        auth.onSignedOut = { signedOut++ }

        assertNull(auth.validAccessToken())
        assertFalse(auth.isSignedIn)
        assertNull(storage.refreshToken)
        assertNull(storage.user)
        assertEquals(1, signedOut)
        assertEquals("Google forgets the chosen account", 1, google.signedOut)
    }

    @Test fun stayingSignedInWhenTheServerCannotBeReached() = runTest {
        routes["POST /api/auth/refresh"] = { json(503, "{}") }
        val storage = InMemorySessionStorage(refreshToken = "refresh-1", user = meera)
        val auth = store(storage)
        assertNull(auth.validAccessToken())
        assertTrue(auth.isSignedIn)
        assertEquals("refresh-1", storage.refreshToken)
    }

    @Test fun signingOutEndsTheSessionOnTheServerToo() = runTest {
        routes["POST /api/auth/logout"] = { MockResponse.Builder().code(204).build() }
        val storage = InMemorySessionStorage(refreshToken = "refresh-1", user = meera)
        val auth = store(storage)
        var signedOut = 0
        auth.onSignedOut = { signedOut++ }

        auth.signOut()

        assertFalse(auth.isSignedIn)
        assertNull(storage.refreshToken)
        assertEquals(1, signedOut)
        val sent = bodyOf(requests.single { path(it) == "POST /api/auth/logout" })
        assertEquals("refresh-1", sent["refreshToken"]?.jsonPrimitive?.content)
        assertEquals("android", sent["client"]?.jsonPrimitive?.content)
    }

    @Test fun deletingTheAccountKeepsThePersonSignedInIfTheServerRefuses() = runTest {
        routes["POST /api/auth/refresh"] = { session("access-2", "refresh-2", withUser = false) }
        routes["DELETE /api/me"] = { json(500, "{}") }
        val auth = store(InMemorySessionStorage(refreshToken = "refresh-1", user = meera))
        assertTrue(runCatching { auth.deleteAccount() }.isFailure)
        assertTrue(auth.isSignedIn)

        routes["DELETE /api/me"] = { MockResponse.Builder().code(204).build() }
        auth.deleteAccount()
        assertFalse(auth.isSignedIn)
        val sent = requests.last { path(it) == "DELETE /api/me" }
        assertEquals("Bearer access-2", sent.headers["Authorization"])
    }

    @Test fun chatIsSentWithTheSignInToken() = runTest {
        routes["POST /api/chat"] = { MockResponse.Builder().body("data: {\"type\":\"done\"}\n\n").build() }
        val request = ChatRequest(listOf(ChatMessage("user", "Hi")), JsonObject(emptyMap()), "t", "2026-10-15")
        api.chat(request, bearer = "access-1").toList()
        assertEquals("Bearer access-1", requests.single { path(it) == "POST /api/chat" }.headers["Authorization"])
    }

    @Test fun describesTheDeviceAsAShortPlainLabel() {
        assertEquals("Google Pixel 9", AuthStore.deviceModel("Google", "Pixel 9"))
        assertEquals("Samsung SM-S928B", AuthStore.deviceModel("samsung", "SM-S928B"))
        assertEquals("the maker is not repeated", "Google sdk_gphone64_arm64", AuthStore.deviceModel("Google", "sdk_gphone64_arm64"))
        assertEquals("OnePlus 12", AuthStore.deviceModel("OnePlus", "OnePlus 12"))
        assertEquals("Acme Phone", AuthStore.deviceModel("Acme", "Phone™"))
        assertEquals("Android", AuthStore.deviceModel(null, null))
        assertEquals(64, AuthStore.deviceModel("Maker", "x".repeat(100)).length)
    }
}
