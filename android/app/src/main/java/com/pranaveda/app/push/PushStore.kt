package com.pranaveda.app.push

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.pranaveda.app.BuildConfig
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.calendar.CalendarStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Firebase, set up from the build's settings (local.properties) rather than google-services.json, so builds without them still work. */
object PushSetup {
    @Volatile var ready = false
        private set

    fun start(context: Context): Boolean {
        if (ready) return true
        val settings = listOf(BuildConfig.PV_FCM_API_KEY, BuildConfig.PV_FCM_APP_ID, BuildConfig.PV_FCM_PROJECT_ID, BuildConfig.PV_FCM_SENDER_ID)
        if (settings.any { it.isBlank() }) return false
        val options = FirebaseOptions.Builder()
            .setApiKey(BuildConfig.PV_FCM_API_KEY)
            .setApplicationId(BuildConfig.PV_FCM_APP_ID)
            .setProjectId(BuildConfig.PV_FCM_PROJECT_ID)
            .setGcmSenderId(BuildConfig.PV_FCM_SENDER_ID)
            .build()
        ready = runCatching { if (FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context, options) }.isSuccess
        return ready
    }
}

/** This phone's registration with the server for free-time nudges (KAN-31). */
class PushStore(
    private val context: Context,
    private val api: AccountApi,
    private val prefs: SharedPreferences,
    private val scope: CoroutineScope,
) {
    var auth: AuthStore? = null
    var calendar: CalendarStore? = null

    /** The server sends this phone's free-time nudges; its own stand down. */
    var serverNudges by mutableStateOf(prefs.getBoolean(SERVER_KEY, false))
        private set

    private var onScreen = false
    private var seenLoop: Job? = null

    /** Signed in with free-time reminders on: register this phone (each launch); otherwise stop. */
    fun update(wanted: Boolean) {
        if (!wanted) {
            scope.launch { stop() }
            return
        }
        if (!PushSetup.start(context)) return setServer(false)
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> scope.launch { registered(token) } }
            .addOnFailureListener { setServer(false) }
    }

    /** A token from Firebase (also when it replaces one), handed to the server. */
    suspend fun registered(token: String) {
        val bearer = auth?.validAccessToken() ?: return
        try {
            api.registerPushToken(token, bearer)
            prefs.edit().putString(TOKEN_KEY, token).apply()
            setServer(true)
            // Busy times straight away, so the first nudge needn't wait for the screen to change.
            report(seen = onScreen)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Offline: the phone keeps showing its own until the next launch.
            setServer(false)
        }
    }

    /** Before signing out, or with free-time reminders turned off. */
    suspend fun stop() {
        val token = prefs.getString(TOKEN_KEY, null)
        val bearer = if (token != null) auth?.validAccessToken() else null
        if (token != null && bearer != null) {
            try {
                api.forgetPushToken(token, bearer)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
        forget()
    }

    /** Without a word to the server (the session had ended): Firebase drops the token, so Google tells the server it's gone. */
    fun forget() {
        if (prefs.getString(TOKEN_KEY, null) == null && !serverNudges) return
        prefs.edit().remove(TOKEN_KEY).apply()
        if (PushSetup.ready) runCatching { FirebaseMessaging.getInstance().deleteToken() }
        setServer(false)
    }

    /** Busy times, and whether the app is on screen (no nudge then), as the website keeps the server told. */
    suspend fun report(seen: Boolean) {
        if (!serverNudges) return
        val bearer = auth?.validAccessToken() ?: return
        val upload = calendar?.serverUpload() ?: return
        try {
            api.sendPushState(seen, upload, bearer)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }

    /** On screen, the server is told again every five minutes, as the website does. */
    fun setOnScreen(active: Boolean) {
        onScreen = active
        seenLoop?.cancel()
        seenLoop = scope.launch {
            report(seen = active)
            while (active && isActive) {
                delay(SEEN_EVERY_MS)
                report(seen = true)
            }
        }
    }

    private fun setServer(on: Boolean) {
        if (on == serverNudges) return
        serverNudges = on
        prefs.edit().putBoolean(SERVER_KEY, on).apply()
    }

    companion object {
        const val SERVER_KEY = "pranaveda_server_nudges"
        private const val TOKEN_KEY = "pranaveda_push_token"
        private const val SEEN_EVERY_MS = 5 * 60 * 1000L
    }
}
