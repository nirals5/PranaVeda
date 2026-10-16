package com.pranaveda.app.auth

import com.pranaveda.app.model.PracticeLogEntry
import com.pranaveda.app.model.PracticePage
import com.pranaveda.app.model.PvJson
import com.pranaveda.app.net.HttpStatusException
import com.pranaveda.app.net.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** The signed-in person, as /api/me and the sign-in endpoints describe them. */
@Serializable
data class AccountUser(
    val id: String,
    val email: String? = null,
    val displayName: String? = null,
    val timezone: String? = null,
)

/** A native session: the server hands native apps their tokens directly (the website keeps them in cookies). */
@Serializable
data class SessionResponse(
    val user: AccountUser? = null,
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Double,
)

/** The wellness profile stored in the account. Version 0: none yet. */
@Serializable
data class VersionedProfile(val profile: JsonObject, val version: Int)

/**
 * What kind of device this is, for the account's list of signed-in devices.
 * Coarse on purpose, matching what the server keeps (see api/_lib/device.ts).
 */
@Serializable
data class DeviceDescription(
    val deviceClass: String,
    val osVersion: String,
    val deviceModel: String,
    val appVersion: String,
)

sealed class AccountException(message: String) : Exception(message) {
    /** This email already has an account, made with another sign-in method. */
    class AccountExists(val provider: String) : AccountException(
        "This email already has a PranaVeda account. Please continue with " +
            (mapOf("google" to "Google", "apple" to "Apple")[provider] ?: "your other sign-in") + " instead.",
    )

    /** The refresh token is no longer valid: the session is over. */
    class SessionEnded : AccountException("Your session has ended. Please sign in again.")

    /** The server answered something else; sign-in or sync is unavailable. */
    class Unavailable(val status: Int) : AccountException("Sign-in is not available right now. Please try again.")
}

/** The account endpoints, as the iOS app uses them (client "android"). */
class AccountApi(private val api: ApiClient = ApiClient()) {
    @Serializable private data class NonceBody(val nonce: String)
    @Serializable private data class ErrorBody(val error: String? = null, val provider: String? = null)
    @Serializable private data class GoogleBody(val credential: String, val nonce: String, val device: DeviceDescription, val client: String = CLIENT)
    @Serializable private data class RefreshBody(val refreshToken: String, val client: String = CLIENT)
    @Serializable private data class DeleteBody(val confirm: Boolean = true)
    @Serializable private data class SaveProfileBody(val profile: JsonObject, val baseVersion: Int)

    private class Reply(val status: Int, val body: String)

    private suspend fun send(method: String, path: String, bearer: String? = null, body: String? = null): Reply =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(api.baseUrl.resolve(path)!!)
                .method(method, body?.toRequestBody(ApiClient.JSON))
                .apply { if (bearer != null) header("Authorization", "Bearer $bearer") }
                .build()
            api.http.newCall(request).execute().use { Reply(it.code, it.body.string()) }
        }

    suspend fun signInNonce(): String {
        val reply = send("GET", "api/auth/nonce")
        if (reply.status != 200) throw AccountException.Unavailable(reply.status)
        return PvJson.decodeFromString(NonceBody.serializer(), reply.body).nonce
    }

    suspend fun signInWithGoogle(idToken: String, nonce: String, device: DeviceDescription): SessionResponse {
        val reply = send("POST", "api/auth/google", body = PvJson.encodeToString(GoogleBody.serializer(), GoogleBody(idToken, nonce, device)))
        if (reply.status == 409) {
            val error = runCatching { PvJson.decodeFromString(ErrorBody.serializer(), reply.body) }.getOrNull()
            if (error?.error == "account_exists") throw AccountException.AccountExists(error.provider ?: "")
        }
        if (reply.status != 200) throw AccountException.Unavailable(reply.status)
        return PvJson.decodeFromString(SessionResponse.serializer(), reply.body)
    }

    /** A new access token (and rotated refresh token) for a session. */
    suspend fun refreshSession(refreshToken: String): SessionResponse {
        val reply = send("POST", "api/auth/refresh", body = PvJson.encodeToString(RefreshBody.serializer(), RefreshBody(refreshToken)))
        if (reply.status == 401) throw AccountException.SessionEnded()
        if (reply.status != 200) throw AccountException.Unavailable(reply.status)
        return PvJson.decodeFromString(SessionResponse.serializer(), reply.body)
    }

    suspend fun signOut(refreshToken: String) {
        send("POST", "api/auth/logout", body = PvJson.encodeToString(RefreshBody.serializer(), RefreshBody(refreshToken)))
    }

    /** Permanent: removes the account and everything the server holds for it. */
    suspend fun deleteAccount(accessToken: String) {
        val reply = send("DELETE", "api/me", bearer = accessToken, body = PvJson.encodeToString(DeleteBody.serializer(), DeleteBody()))
        if (reply.status != 204) throw AccountException.Unavailable(reply.status)
    }

    suspend fun fetchAccountProfile(accessToken: String): VersionedProfile {
        val reply = send("GET", "api/sync/profile", bearer = accessToken)
        if (reply.status != 200) throw AccountException.Unavailable(reply.status)
        return PvJson.decodeFromString(VersionedProfile.serializer(), reply.body)
    }

    /** Saves the profile if nobody has saved since [baseVersion]; either way, returns what is stored now. */
    suspend fun saveAccountProfile(profile: JsonObject, baseVersion: Int, accessToken: String): VersionedProfile {
        val body = PvJson.encodeToString(SaveProfileBody.serializer(), SaveProfileBody(profile, baseVersion))
        val reply = send("PUT", "api/sync/profile", bearer = accessToken, body = body)
        if (reply.status != 200 && reply.status != 409) throw AccountException.Unavailable(reply.status)
        return PvJson.decodeFromString(VersionedProfile.serializer(), reply.body)
    }

    @Serializable private data class UploadBody(val entries: List<PracticeLogEntry>)

    /**
     * Sends practices the account may not have yet (at most 25). Sending one it
     * already has is fine. Throws [HttpStatusException] 401 for an expired sign-in.
     */
    suspend fun uploadPractices(entries: List<PracticeLogEntry>, accessToken: String) {
        val reply = send("POST", "api/sync/practice-log", bearer = accessToken, body = PvJson.encodeToString(UploadBody.serializer(), UploadBody(entries)))
        if (reply.status != 200) throw HttpStatusException(reply.status)
    }

    /** The account's practices received after [cursor] (0 for all), oldest first. */
    suspend fun practicesAfter(cursor: Long, accessToken: String): PracticePage {
        val reply = send("GET", "api/sync/practice-log?after=$cursor", bearer = accessToken)
        if (reply.status != 200) throw HttpStatusException(reply.status)
        return PvJson.decodeFromString(PracticePage.serializer(), reply.body)
    }

    private companion object {
        const val CLIENT = "android"
    }
}
