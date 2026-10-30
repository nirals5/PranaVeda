package com.pranaveda.app.place

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.pranaveda.app.MainActivity
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.R
import com.pranaveda.app.calendar.CalendarStore
import com.pranaveda.app.calendar.FreeTime
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/**
 * Arrival reminders: a gentle note when they get to a saved place (home, a
 * studio, an outdoor spot) and stay a few minutes. The phone itself watches
 * the places (Google Play services geofences), so it works with the app
 * closed; nothing reaches a server. Paced with the free-time reminders:
 * waking hours only, not soon after a practice, at least three hours after
 * any PranaVeda reminder, and at most once a day for each place.
 */
object Arrival {
    /** Work is left out: a nudge on walking into work would intrude. */
    val KINDS = listOf(PlaceKind.Home, PlaceKind.Studio, PlaceKind.Outdoors)
    const val RADIUS_METRES = Places.MATCH_RADIUS_METRES.toFloat()
    /** They must stay this long, so passing by or a quick stop doesn't count. */
    val STAY: Duration = Duration.ofMinutes(5)

    fun text(kind: PlaceKind): String = when (kind) {
        PlaceKind.Home -> "You're home. A few minutes of slow breathing to settle in?"
        PlaceKind.Studio -> "You're at the studio, with room for a fuller practice. Amrita can guide you."
        PlaceKind.Outdoors -> "You're at your outdoor spot. A standing practice here?"
        PlaceKind.Work -> "You're at work. Something quiet at your desk?"
    }

    /** Whether a reminder may show [at] (the end of the stay). */
    fun shouldRemind(
        kind: PlaceKind,
        at: Instant,
        lastPracticeAt: Instant?,
        lastReminderAt: Instant?,
        remindedAt: Instant?,
        busyNow: Boolean,
        zone: ZoneId = ZoneId.systemDefault(),
    ): Boolean {
        if (kind !in KINDS || busyNow || at.atZone(zone).hour !in FreeTime.WAKING_HOURS) return false
        if (lastPracticeAt != null && Duration.between(lastPracticeAt, at) < FreeTime.REST_AFTER_PRACTICE) return false
        if (lastReminderAt != null && Duration.between(lastReminderAt, at) < FreeTime.MIN_GAP_BETWEEN_REMINDERS) return false
        if (remindedAt != null && remindedAt.atZone(zone).toLocalDate() == at.atZone(zone).toLocalDate()) return false
        return true
    }
}

/** The switch, the permissions it needs, and the geofences for the saved places. */
class ArrivalStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)

    var on by mutableStateOf(prefs.getBoolean(ON_KEY, false))
        private set
    /** Location isn't "Allow all the time" with precise location, so arrivals can't be noticed. */
    var needsAllTheTime by mutableStateOf(false)
        private set

    init {
        needsAllTheTime = on && !canWatch()
    }

    fun canNotify() = NotificationManagerCompat.from(appContext).areNotificationsEnabled()

    /** Geofences need precise location, and "all the time" from Android 10. */
    fun canWatch() = granted(Manifest.permission.ACCESS_FINE_LOCATION) &&
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION))

    private fun granted(permission: String) = appContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    /** After the permission prompts, whatever was allowed; the card says what's missing. */
    fun turn(on: Boolean) {
        this.on = on
        prefs.edit().putBoolean(ON_KEY, on).apply()
        refresh()
    }

    /** The app came on screen, the phone restarted or a place changed: watch what's saved now. */
    fun refresh() {
        needsAllTheTime = on && !canWatch()
        sync()
    }

    @SuppressLint("MissingPermission") // canWatch() just before.
    private fun sync() {
        val client = LocationServices.getGeofencingClient(appContext)
        client.removeGeofences(pendingIntent())
        if (!on || !canWatch() || !prefs.getBoolean(PlaceStore.ENABLED_KEY, false)) return
        val fences = PlaceStore.savedPlaces(prefs).filter { it.kind in Arrival.KINDS }.map {
            Geofence.Builder()
                .setRequestId(it.kind.wire)
                .setCircularRegion(it.lat, it.lon, Arrival.RADIUS_METRES)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_DWELL)
                .setLoiteringDelay(Arrival.STAY.toMillis().toInt())
                .build()
        }
        if (fences.isEmpty()) return
        // No initial trigger: being at a place when it's added isn't an arrival.
        val request = GeofencingRequest.Builder().setInitialTrigger(0).addGeofences(fences).build()
        client.addGeofences(request, pendingIntent())
    }

    private fun pendingIntent(): PendingIntent = PendingIntent.getBroadcast(
        appContext, 0,
        Intent(appContext, ArrivalReceiver::class.java).setAction(ACTION_ARRIVED),
        // Play services fills in which place it was.
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )

    /** From [ArrivalReceiver]: the note when one may show now, recorded as shown; otherwise null. */
    fun reminderDue(kind: PlaceKind, now: Instant, lastPracticeAt: Instant?, calendar: CalendarStore): String? {
        if (!on || prefs.getBoolean(CalendarStore.ON_SCREEN_KEY, false)) return null
        val busyNow = calendar.enabled && (CalendarStore.readBusy(appContext, now)?.let { FreeTime.window(it, now).first } ?: false)
        val remindedAt = prefs.getLong(REMINDED_KEY + kind.wire, 0).takeIf { it > 0 }?.let(Instant::ofEpochMilli)
        if (!Arrival.shouldRemind(kind, now, lastPracticeAt, lastReminderAt(prefs), remindedAt, busyNow)) return null
        prefs.edit().putLong(REMINDED_KEY + kind.wire, now.toEpochMilli()).putLong(LAST_AT_KEY, now.toEpochMilli()).apply()
        return Arrival.text(kind)
    }

    companion object {
        private const val ON_KEY = "pranaveda_arrival_reminders"
        private const val LAST_AT_KEY = "pranaveda_arrival_last_at"
        private const val REMINDED_KEY = "pranaveda_arrival_reminded_"
        const val ACTION_ARRIVED = "com.pranaveda.app.ARRIVED"
        const val CHANNEL = "arrival"

        /** The latest free-time or arrival reminder: three hours from any PranaVeda reminder. */
        fun lastReminderAt(prefs: SharedPreferences): Instant? =
            listOf(prefs.getLong(LAST_AT_KEY, 0), prefs.getLong(CalendarStore.SHOWN_AT_KEY, 0))
                .filter { it > 0 }.maxOrNull()?.let(Instant::ofEpochMilli)
    }
}

/** A stay at a saved place (from Play services), or a restart that cleared the geofences. */
class ArrivalReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as PranaVedaApplication
        if (intent.action != ArrivalStore.ACTION_ARRIVED) {
            app.arrival.refresh()
            return
        }
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError() || event.geofenceTransition != Geofence.GEOFENCE_TRANSITION_DWELL) return
        val lastPractice = app.practice.entries.lastOrNull()?.completedInstant
        val text = event.triggeringGeofences.orEmpty()
            .mapNotNull { fence -> PlaceKind.entries.firstOrNull { it.wire == fence.requestId } }
            .firstNotNullOfOrNull { app.arrival.reminderDue(it, Instant.now(), lastPractice, app.calendar) }
            ?: return
        notify(context, text)
    }

    private fun notify(context: Context, text: String) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(ArrivalStore.CHANNEL) == null) {
            manager.createNotificationChannel(NotificationChannel(ArrivalStore.CHANNEL, "Arrival reminders", NotificationManager.IMPORTANCE_DEFAULT))
        }
        // Opens on Amrita, where the first suggestion fits the place.
        val open = PendingIntent.getActivity(
            context, 1,
            Intent(Intent.ACTION_VIEW, Uri.parse("pranaveda://amrita"), context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, ArrivalStore.CHANNEL)
            .setSmallIcon(R.drawable.ic_lotus)
            .setContentTitle("A moment for yourself")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        manager.notify(NOTIFICATION_ID, notification)
    }

    private companion object {
        const val NOTIFICATION_ID = 4108
    }
}
