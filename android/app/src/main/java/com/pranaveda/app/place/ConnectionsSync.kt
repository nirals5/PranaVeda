package com.pranaveda.app.place

import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AccountUser
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.net.HttpStatusException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/**
 * Saved places kept on the account once the user turns that on, so the
 * website and their other devices use the same ones (the website keeps its
 * calendar link there too; the app leaves it alone). Off by default: until
 * then places stay on this phone. While on, the account's places are the
 * ones in use, and a change here is sent straight away. The website's
 * useConnectionsSync and the iPhone's ConnectionsSync follow the same rules.
 */
object ConnectionsMerge {
    /** A phone joining an account that already keeps them: the account's spot wins for each kind, this phone adds kinds the account lacks. */
    fun join(account: List<SavedPlace>, phone: List<SavedPlace>): List<SavedPlace> {
        val kinds = account.map { it.kind }.toSet()
        return sorted(account + phone.filter { it.kind !in kinds })
    }

    fun same(a: List<SavedPlace>, b: List<SavedPlace>): Boolean = sorted(a) == sorted(b)

    private fun sorted(places: List<SavedPlace>) = places.sortedBy { it.kind.ordinal }
}

/** What the server answers: the account's places (and version), or that it keeps none. [conflict] when a write was based on an older version. */
@Serializable
data class AccountConnections(
    val kept: Boolean,
    val connections: Stored = Stored(),
    val version: Int = 0,
    @Transient val conflict: Boolean = false,
) {
    @Serializable
    data class Stored(val places: List<SavedPlace> = emptyList())
}

class ConnectionsSync(
    private val api: AccountApi,
    private val prefs: SharedPreferences,
    private val place: PlaceStore,
    private val scope: CoroutineScope,
) {
    /** Null until the account has been asked. */
    var kept by mutableStateOf<Boolean?>(null)
        private set
    var pending by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)
        private set

    var auth: AuthStore? = null
    private val syncLock = Mutex()
    private var syncAgain = false

    private val version get() = prefs.getInt(VERSION_KEY, 0)
    private val agreed get() = Places.decode(prefs.getString(AGREED_KEY, null))

    // Signing in and out

    /** After sign-in, and once per launch for a restored session. */
    suspend fun adoptAccount(user: AccountUser) {
        if (prefs.getString(OWNER_KEY, null) != user.id) {
            prefs.edit().remove(VERSION_KEY).remove(AGREED_KEY).remove(OWN_KEY).putString(OWNER_KEY, user.id).apply()
        }
        sync()
    }

    /** After sign-out: this phone goes back to its own places. */
    fun handBackDevice() {
        if (prefs.getString(OWNER_KEY, null) == null) return
        val own = prefs.getString(OWN_KEY, null)
        if (version > 0 && own != null) place.replace(Places.decode(own))
        prefs.edit().remove(OWNER_KEY).remove(VERSION_KEY).remove(AGREED_KEY).remove(OWN_KEY).apply()
        kept = null
    }

    /** A place was saved, moved or removed here. */
    fun placesChanged() {
        if (version > 0 && !ConnectionsMerge.same(place.places, agreed)) scope.launch { sync() }
    }

    // The switch

    suspend fun turnOn() {
        pending = true
        failed = false
        try {
            prefs.edit().putString(OWN_KEY, Places.encode(place.places)).apply()
            val mine = place.places
            val reply = withToken { api.saveConnections(mine, 0, it) } ?: run { failed = true; return }
            if (reply.conflict) {
                // Another device turned it on first: join it.
                prefs.edit().putInt(VERSION_KEY, 0).apply()
                sync()
            } else {
                settle(reply)
            }
        } finally {
            pending = false
        }
    }

    /** Nothing stays on the account; this phone keeps what it has now. */
    suspend fun turnOff() {
        pending = true
        failed = false
        try {
            if (withToken { api.forgetConnections(it) } != null) stopFollowing() else failed = true
        } finally {
            pending = false
        }
    }

    // Syncing

    /** Sends a change made here, or takes the account's places (joining them first if this phone isn't following yet). One run at a time. */
    suspend fun sync() {
        if (prefs.getString(OWNER_KEY, null) == null) return
        if (syncLock.isLocked) {
            syncAgain = true
            return
        }
        syncLock.withLock {
            do {
                syncAgain = false
                if (!syncOnce()) return // offline or refused: tried again next time
            } while (syncAgain)
        }
    }

    private suspend fun syncOnce(): Boolean {
        val version = version
        if (version > 0 && !ConnectionsMerge.same(place.places, agreed)) {
            val mine = place.places
            var reply = withToken { api.saveConnections(mine, version, it) }
            // Changed elsewhere meanwhile: this phone's change is the newest.
            val first = reply
            if (first != null && first.conflict && first.kept) reply = withToken { api.saveConnections(mine, first.version, it) }
            settle(reply ?: return false)
            return true
        }
        val account = withToken { api.connections(it) } ?: return false
        if (!account.kept) {
            if (version > 0) stopFollowing() else kept = false
            return true
        }
        if (version == 0) {
            prefs.edit().putString(OWN_KEY, Places.encode(place.places)).apply()
            val joined = ConnectionsMerge.join(account.connections.places, place.places)
            if (!ConnectionsMerge.same(joined, account.connections.places)) {
                val reply = withToken { api.saveConnections(joined, account.version, it) } ?: return false
                if (reply.conflict) syncAgain = true else settle(reply)
                return true
            }
        }
        use(account.connections.places, account.version)
        return true
    }

    private fun settle(reply: AccountConnections) {
        if (reply.kept) use(reply.connections.places, reply.version) else stopFollowing()
    }

    private fun use(places: List<SavedPlace>, version: Int) {
        prefs.edit().putString(AGREED_KEY, Places.encode(places)).putInt(VERSION_KEY, version).apply()
        place.replace(places)
        kept = true
    }

    private fun stopFollowing() {
        prefs.edit().putInt(VERSION_KEY, 0).remove(AGREED_KEY).remove(OWN_KEY).apply()
        kept = false
    }

    /** Runs a request as the signed-in person, refreshing once if the sign-in had expired. Null when signed out, offline or refused. */
    private suspend fun <T> withToken(request: suspend (String) -> T): T? {
        val auth = auth ?: return null
        val token = auth.validAccessToken() ?: return null
        return try {
            request(token)
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpStatusException) {
            if (e.status != 401) return null
            val fresh = auth.tokenAfterRejection() ?: return null
            runCatching { request(fresh) }.getOrNull()
        } catch (e: Exception) {
            null
        }
    }

    private companion object {
        /** Whose account this phone follows. */
        const val OWNER_KEY = "pranaveda_connections_owner"
        /** The account version this phone's places match; 0 when not following. */
        const val VERSION_KEY = "pranaveda_connections_version"
        /** Those places, so a change here is noticed. */
        const val AGREED_KEY = "pranaveda_connections_synced"
        /** This phone's own places from before it followed the account; put back on sign-out. */
        const val OWN_KEY = "pranaveda_connections_own"
    }
}
