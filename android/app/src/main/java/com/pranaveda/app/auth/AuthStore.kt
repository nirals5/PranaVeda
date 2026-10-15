package com.pranaveda.app.auth

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.pranaveda.app.BuildConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Optional sign-in. Signed out, the app works exactly as before: a guest whose
 * profile lives on the device. Signed in, Amrita reads and saves the profile
 * in the account (see ChatViewModel), so it is shared with the website.
 */
class AuthStore(
    private val api: AccountApi,
    private val storage: SessionStorage,
    private val google: GoogleIdentityProvider,
    private val device: () -> DeviceDescription,
    private val now: () -> Long = System::currentTimeMillis,
) {
    var user by mutableStateOf<AccountUser?>(null)
        private set
    var isBusy by mutableStateOf(false)
        private set

    /** The last thing that went wrong, worded for the person. */
    var problem by mutableStateOf<String?>(null)
        private set

    val isSignedIn: Boolean get() = user != null

    /**
     * Called after every successful sign-in, and once per launch for a
     * restored session: the place to bring the profile in line with the account.
     */
    var onSignedIn: (suspend (AccountUser) -> Unit)? = null

    /** Called whenever the session ends, by any route. */
    var onSignedOut: (() -> Unit)? = null

    private var accessToken: String? = null
    private var accessTokenExpiry = 0L
    private val refreshLock = Mutex()
    private var restoredThisLaunch = false

    init {
        // A stored session shows as signed in at once, even offline; it is
        // checked with the server in restore().
        if (storage.refreshToken != null) user = storage.user
    }

    /** At launch: confirms a stored session with the server. */
    suspend fun restore() {
        if (!isSignedIn || restoredThisLaunch) return
        if (validAccessToken() != null) {
            restoredThisLaunch = true
            user?.let { onSignedIn?.invoke(it) }
        }
    }

    /** [activity] shows Google's sign-in sheet. */
    suspend fun signInWithGoogle(activity: Context) {
        if (isBusy) return
        isBusy = true
        problem = null
        try {
            val nonce = api.signInNonce()
            val idToken = google.idToken(activity, nonce)
            adopt(api.signInWithGoogle(idToken, nonce, device()))
            restoredThisLaunch = true
            user?.let { onSignedIn?.invoke(it) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: SignInCancelled) {
        } catch (e: AccountException) {
            problem = e.message
        } catch (e: Exception) {
            problem = "Sign-in did not complete. Please check your connection and try again."
        } finally {
            isBusy = false
        }
    }

    suspend fun signOut() {
        val token = storage.refreshToken
        endSession()
        if (token != null) runCatching { api.signOut(token) }
    }

    /** Permanent. Throws (and keeps the person signed in) if the server did not confirm the deletion. */
    suspend fun deleteAccount() {
        val token = validAccessToken() ?: throw AccountException.SessionEnded()
        api.deleteAccount(token)
        endSession()
    }

    /**
     * An access token to send with a request, refreshed when it has expired.
     * Null when signed out, or when the session turns out to be over.
     */
    suspend fun validAccessToken(): String? {
        if (!isSignedIn) return null
        accessToken?.let { if (accessTokenExpiry - now() > 30_000) return it }
        return refresh()
    }

    /**
     * The server refused the access token just sent: refresh once. Null means
     * the session is over (the caller then carries on signed out).
     */
    suspend fun tokenAfterRejection(): String? {
        accessToken = null
        return refresh()
    }

    /**
     * One refresh at a time. A refresh token is single-use (the server rotates
     * it), so callers arriving meanwhile wait, then use the token it fetched.
     */
    private suspend fun refresh(): String? = refreshLock.withLock {
        accessToken?.let { if (accessTokenExpiry - now() > 30_000) return it }
        val refreshToken = storage.refreshToken ?: return null
        try {
            adopt(api.refreshSession(refreshToken))
            accessToken
        } catch (e: CancellationException) {
            throw e
        } catch (e: AccountException.SessionEnded) {
            endSession()
            null
        } catch (e: Exception) {
            // Offline or the server is unavailable: stay signed in and try
            // again next time.
            null
        }
    }

    private fun adopt(session: SessionResponse) {
        accessToken = session.accessToken
        accessTokenExpiry = now() + (session.expiresIn * 1000).toLong()
        storage.refreshToken = session.refreshToken
        session.user?.let {
            user = it
            storage.user = it
        }
    }

    private suspend fun endSession() {
        val wasSignedIn = isSignedIn
        storage.refreshToken = null
        storage.user = null
        accessToken = null
        accessTokenExpiry = 0
        user = null
        restoredThisLaunch = false
        runCatching { google.signOut() }
        if (wasSignedIn) onSignedOut?.invoke()
    }

    companion object {
        /** Coarse on purpose: phone or tablet, Android version, model, app version. */
        fun deviceDescription(context: Context): DeviceDescription {
            val tablet = context.resources.configuration.smallestScreenWidthDp >= 600 ||
                context.resources.configuration.screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK >= Configuration.SCREENLAYOUT_SIZE_LARGE
            return DeviceDescription(
                deviceClass = if (tablet) "tablet" else "phone",
                osVersion = Build.VERSION.RELEASE ?: "0",
                deviceModel = deviceModel(Build.MANUFACTURER, Build.MODEL),
                appVersion = BuildConfig.VERSION_NAME,
            )
        }

        /**
         * "Google Pixel 9", as a short plain label the server accepts
         * (letters, digits, spaces and a little punctuation, up to 64 characters).
         */
        internal fun deviceModel(manufacturer: String?, model: String?): String {
            val maker = manufacturer.orEmpty().trim().replaceFirstChar { it.uppercase() }
            val name = model.orEmpty().trim()
            val full = if (maker.isEmpty() || name.startsWith(maker, ignoreCase = true)) name else "$maker $name"
            return full.replace(Regex("""[^\w .,()+-]"""), "").trim().take(64).ifEmpty { "Android" }
        }
    }
}
