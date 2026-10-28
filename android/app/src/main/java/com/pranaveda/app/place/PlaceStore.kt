package com.pranaveda.app.place

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.location.LocationRequestCompat
import com.pranaveda.app.model.PvJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/*
 * Where they are, in terms that matter for practice, as on the website
 * (src/hooks/usePlace.ts). While the app is open the phone's position is
 * matched against spots they have saved themselves (home, work, …).
 * Coordinates never leave the phone and no history is kept: Amrita is told
 * only the kind of place.
 */

@Serializable
enum class PlaceKind(val label: String) {
    @SerialName("home") Home("Home"),
    @SerialName("work") Work("Work"),
    @SerialName("studio") Studio("Studio or gym"),
    @SerialName("outdoors") Outdoors("Outdoor spot"),
    ;

    /** The server's word for it (sanitizeLocationContext). */
    val wire: String get() = name.lowercase()
}

/** A saved kind of place, or [Elsewhere] for a good position that matches none. */
sealed interface CurrentPlace {
    val wire: String
    val label: String

    data class Saved(val kind: PlaceKind) : CurrentPlace {
        override val wire get() = kind.wire
        override val label get() = kind.label
    }

    data object Elsewhere : CurrentPlace {
        override val wire = "elsewhere"
        override val label = "Somewhere else"
    }
}

@Serializable
data class SavedPlace(val kind: PlaceKind, val lat: Double, val lon: Double)

/** [accuracy] in metres. */
data class PlacePosition(val lat: Double, val lon: Double, val accuracy: Double)

/** What goes with a message: the kind of place only. */
@Serializable
data class LocationContext(val place: String)

object Places {
    const val MATCH_RADIUS_METRES = 150.0

    /** Beyond this the position is a town-sized guess (approximate location) and says nothing about which place they are in. */
    const val MAX_USABLE_ACCURACY_METRES = 2000.0

    fun distanceMetres(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        fun rad(deg: Double) = deg * Math.PI / 180
        val dLat = rad(bLat - aLat)
        val dLon = rad(bLon - aLon)
        val h = sin(dLat / 2).pow(2) + cos(rad(aLat)) * cos(rad(bLat)) * sin(dLon / 2).pow(2)
        return 6_371_000 * 2 * asin(sqrt(h))
    }

    /** The nearest saved place within reach; elsewhere when the position is good but matches none; null when there is nothing trustworthy to say. */
    fun match(position: PlacePosition?, places: List<SavedPlace>): CurrentPlace? {
        if (position == null || position.accuracy > MAX_USABLE_ACCURACY_METRES || places.isEmpty()) return null
        // A vague position widens the net a little, but never past a few streets.
        val radius = max(MATCH_RADIUS_METRES, min(position.accuracy, 500.0))
        val nearest = places.minBy { distanceMetres(position.lat, position.lon, it.lat, it.lon) }
        return if (distanceMetres(position.lat, position.lon, nearest.lat, nearest.lon) <= radius) {
            CurrentPlace.Saved(nearest.kind)
        } else {
            CurrentPlace.Elsewhere
        }
    }

    fun isImprecise(position: PlacePosition?) = (position?.accuracy ?: 0.0) > MAX_USABLE_ACCURACY_METRES

    /** One spot per kind: saving again moves it to where they are now. A rough position is not saved. */
    fun save(places: List<SavedPlace>, kind: PlaceKind, position: PlacePosition?): List<SavedPlace> {
        if (position == null || isImprecise(position)) return places
        return places.filter { it.kind != kind } + SavedPlace(kind, position.lat, position.lon)
    }

    /** Nothing unless location is on and the position says something. */
    fun context(enabled: Boolean, position: PlacePosition?, places: List<SavedPlace>): LocationContext? =
        if (enabled) match(position, places)?.let { LocationContext(it.wire) } else null

    private val listSerializer = ListSerializer(SavedPlace.serializer())
    fun encode(places: List<SavedPlace>): String = PvJson.encodeToString(listSerializer, places)
    fun decode(json: String?): List<SavedPlace> =
        json?.let { runCatching { PvJson.decodeFromString(listSerializer, it) }.getOrNull() } ?: emptyList()
}

/** The on-device side: the setting, the saved spots, and the phone's position while the app is open. */
class PlaceStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
    private val locationManager = appContext.getSystemService(LocationManager::class.java)

    var enabled by mutableStateOf(prefs.getBoolean(ENABLED_KEY, false))
        private set
    var places by mutableStateOf(Places.decode(prefs.getString(PLACES_KEY, null)))
        private set
    var position by mutableStateOf<PlacePosition?>(null)
        private set
    /** Location is not allowed for PranaVeda. */
    var blocked by mutableStateOf(false)
        private set
    /** They allowed only an approximate location. */
    var approximateOnly by mutableStateOf(false)
        private set

    /** Watching only while the app is on screen. */
    private var active = false
    private var watching = false
    private val listener = LocationListenerCompat { location -> position = location.toPosition() }

    val located get() = position != null
    val imprecise get() = Places.isImprecise(position)
    val current get() = if (enabled) Places.match(position, places) else null

    fun contextForAmrita(): LocationContext? = Places.context(enabled, position, places)

    /** After the permission prompt, so it had a clear cause. */
    fun enable() {
        enabled = true
        prefs.edit().putBoolean(ENABLED_KEY, true).apply()
        watch()
    }

    fun disable() {
        enabled = false
        position = null
        prefs.edit().remove(ENABLED_KEY).apply()
        stop()
    }

    /** The app came on screen or left it. */
    fun setActive(active: Boolean) {
        this.active = active
        if (active) watch() else stop()
    }

    fun save(kind: PlaceKind) {
        places = Places.save(places, kind, position)
        persist()
    }

    fun remove(kind: PlaceKind) {
        places = places.filter { it.kind != kind }
        persist()
    }

    private fun persist() = prefs.edit().putString(PLACES_KEY, Places.encode(places)).apply()

    fun hasPermission() = granted(Manifest.permission.ACCESS_COARSE_LOCATION) || granted(Manifest.permission.ACCESS_FINE_LOCATION)

    private fun granted(permission: String) = ContextCompat.checkSelfPermission(appContext, permission) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission") // Checked just before.
    private fun watch() {
        if (!enabled || !active) return
        blocked = !hasPermission()
        if (blocked) {
            position = null
            stop()
            return
        }
        approximateOnly = !granted(Manifest.permission.ACCESS_FINE_LOCATION)
        if (watching) return
        val provider = provider() ?: return
        // A recent position shows straight away; then updates as they move.
        locationManager.getLastKnownLocation(provider)
            ?.takeIf { SystemClock.elapsedRealtimeNanos() - it.elapsedRealtimeNanos < RECENT_NANOS }
            ?.let { position = it.toPosition() }
        // No minimum distance: a sharper position in the same spot (after a
        // rough first one) must still come through.
        val request = LocationRequestCompat.Builder(30_000)
            .setMinUpdateIntervalMillis(10_000)
            .setQuality(LocationRequestCompat.QUALITY_BALANCED_POWER_ACCURACY)
            .build()
        LocationManagerCompat.requestLocationUpdates(locationManager, provider, request, listener, Looper.getMainLooper())
        watching = true
    }

    private fun stop() {
        if (!watching) return
        LocationManagerCompat.removeUpdates(locationManager, listener)
        watching = false
    }

    /** Google's fused positioning where the phone has it (no Play services library needed), else the network, else GPS. */
    private fun provider(): String? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && locationManager.hasProvider(LocationManager.FUSED_PROVIDER)) {
            return LocationManager.FUSED_PROVIDER
        }
        val on = locationManager.getProviders(true)
        return listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull { it in on }
    }

    private fun Location.toPosition() = PlacePosition(latitude, longitude, if (hasAccuracy()) accuracy.toDouble() else Double.MAX_VALUE)

    companion object {
        private const val ENABLED_KEY = "pranaveda_location_enabled"
        private const val PLACES_KEY = "pranaveda_places"
        private const val RECENT_NANOS = 5 * 60 * 1_000_000_000L
        val PERMISSIONS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
}
