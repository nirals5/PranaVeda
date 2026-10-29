package com.pranaveda.app.calendar

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.CalendarContract
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.pranaveda.app.MainActivity
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.R
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * The phone's calendar, read for busy and free time only, as the website
 * reads a connected one (src/hooks/useExternalCalendar.ts). Off until they
 * turn it on. Amrita gets the shape of the day ([CalendarContext]); titles,
 * places and people never leave the phone.
 *
 * Free-time reminders: every 15 minutes WorkManager lets [FreeTimeWorker]
 * look at the calendar as it is then, and post a reminder when the website's
 * rules allow. No server is involved.
 */
class CalendarStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)

    var enabled by mutableStateOf(prefs.getBoolean(ENABLED_KEY, false))
        private set
    var remindersOn by mutableStateOf(prefs.getBoolean(REMINDERS_KEY, false))
        private set
    var busy by mutableStateOf<List<BusyInterval>>(emptyList())
        private set
    /** Calendar access is not allowed for PranaVeda. */
    var blocked by mutableStateOf(false)
        private set
    /** Set once the calendar has been read; free time is not trusted before. */
    var readAt by mutableStateOf<Instant?>(null)
        private set

    fun hasPermission() = appContext.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

    fun canNotify() = NotificationManagerCompat.from(appContext).areNotificationsEnabled()

    /** What goes with a message: nothing unless the calendar is on and read. */
    fun contextForAmrita(now: Instant = Instant.now()): CalendarContext? =
        if (enabled && !blocked && readAt != null) FreeTime.context(busy, now) else null

    /** The opening to offer on the welcome screen, if any. */
    fun openSlot(now: Instant, lastPracticeAt: Instant?): OpenSlot? =
        if (enabled && !blocked && readAt != null) FreeTime.openSlot(busy, now, lastPracticeAt) else null

    /** After the permission prompt, so it had a clear cause. */
    fun enable() {
        enabled = true
        prefs.edit().putBoolean(ENABLED_KEY, true).apply()
        refresh()
        if (remindersOn) schedule()
    }

    fun disable() {
        enabled = false
        busy = emptyList()
        readAt = null
        prefs.edit().remove(ENABLED_KEY).apply()
        WorkManager.getInstance(appContext).cancelUniqueWork(WORK_NAME)
    }

    fun setReminders(on: Boolean) {
        remindersOn = on
        prefs.edit().putBoolean(REMINDERS_KEY, on).apply()
        if (on) schedule() else WorkManager.getInstance(appContext).cancelUniqueWork(WORK_NAME)
    }

    /** At launch: keep the check running if reminders are on. */
    fun resume() {
        if (enabled && remindersOn) schedule()
    }

    /** Today and tomorrow, as on the website. */
    fun refresh(now: Instant = Instant.now()) {
        if (!enabled) return
        val read = readBusy(appContext, now)
        blocked = read == null
        busy = read ?: emptyList()
        readAt = if (read == null) null else now
    }

    /** Stands in for the calendar (tests). */
    fun setBusy(value: List<BusyInterval>, at: Instant = Instant.now()) {
        busy = value
        readAt = at
    }

    /** On screen: read the calendar afresh. Off screen: note when, so a reminder waits 15 minutes. */
    fun setActive(active: Boolean) {
        prefs.edit().putBoolean(ON_SCREEN_KEY, active).apply { if (!active) putLong(LEFT_AT_KEY, System.currentTimeMillis()) }.apply()
        if (active) refresh()
    }

    /** From [FreeTimeWorker]: the reminder text when one is due now, recorded as shown; otherwise null. */
    fun reminderDue(now: Instant, lastPracticeAt: Instant?): String? {
        if (!enabled || !remindersOn || prefs.getBoolean(ON_SCREEN_KEY, false)) return null
        val leftAt = Instant.ofEpochMilli(prefs.getLong(LEFT_AT_KEY, 0))
        if (Duration.between(leftAt, now) < FreeTime.AWAY_BEFORE_REMINDER) return null
        val busy = readBusy(appContext, now) ?: return null // fail closed
        val slot = FreeTime.openSlot(busy, now, lastPracticeAt)
        val lastAt = prefs.getLong(SHOWN_AT_KEY, 0).takeIf { it > 0 }?.let(Instant::ofEpochMilli)
        if (!FreeTime.shouldRemind(slot, now, prefs.getString(SHOWN_KEY, null), lastAt)) return null
        prefs.edit().putString(SHOWN_KEY, slot!!.key).putLong(SHOWN_AT_KEY, now.toEpochMilli()).apply()
        return FreeTime.describe(slot)
    }

    private fun schedule() {
        WorkManager.getInstance(appContext).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<FreeTimeWorker>(15, TimeUnit.MINUTES).build(),
        )
    }

    companion object {
        private const val ENABLED_KEY = "pranaveda_calendar_enabled"
        private const val REMINDERS_KEY = "pranaveda_free_time_reminders"
        private const val ON_SCREEN_KEY = "pranaveda_on_screen"
        private const val LEFT_AT_KEY = "pranaveda_left_screen_at"
        private const val SHOWN_KEY = "pranaveda_free_time_last_key"
        private const val SHOWN_AT_KEY = "pranaveda_free_time_last_at"
        private const val WORK_NAME = "pranaveda-free-time"
        const val CHANNEL = "free_time"

        /** Busy intervals for today and tomorrow, or null when the calendar can't be read. */
        fun readBusy(context: Context, now: Instant, zone: ZoneId = ZoneId.systemDefault()): List<BusyInterval>? {
            if (context.checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) return null
            val start = LocalDate.ofInstant(now, zone).atStartOfDay(zone).toInstant()
            val end = start.atZone(zone).plusDays(2).toInstant()
            val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
                ContentUris.appendId(it, start.toEpochMilli())
                ContentUris.appendId(it, end.toEpochMilli())
            }.build()
            val columns = arrayOf(
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.AVAILABILITY,
                CalendarContract.Instances.STATUS,
                CalendarContract.Instances.SELF_ATTENDEE_STATUS,
            )
            val events = mutableListOf<CalendarEvent>()
            return runCatching {
                context.contentResolver.query(uri, columns, null, null, null)?.use { c ->
                    while (c.moveToNext()) {
                        events += CalendarEvent(
                            start = Instant.ofEpochMilli(c.getLong(0)),
                            end = Instant.ofEpochMilli(c.getLong(1)),
                            allDay = c.getInt(2) == 1,
                            showsAsFree = c.getInt(3) == CalendarContract.Events.AVAILABILITY_FREE,
                            cancelled = c.getInt(4) == CalendarContract.Events.STATUS_CANCELED,
                            declined = c.getInt(5) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED,
                        )
                    }
                }
                FreeTime.busy(events)
            }.getOrNull()
        }
    }
}

/** Every 15 minutes: a free-time reminder, if the calendar and the rules allow one now. */
class FreeTimeWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val app = applicationContext as PranaVedaApplication
        val lastPractice = app.practice.entries.lastOrNull()?.completedInstant
        val text = app.calendar.reminderDue(Instant.now(), lastPractice) ?: return Result.success()
        notify(applicationContext, text)
        return Result.success()
    }

    private fun notify(context: Context, text: String) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CalendarStore.CHANNEL) == null) {
            manager.createNotificationChannel(NotificationChannel(CalendarStore.CHANNEL, "Free-time reminders", NotificationManager.IMPORTANCE_DEFAULT))
        }
        // Opens on Amrita, where the welcome shows the opening and Practice now.
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(Intent.ACTION_VIEW, Uri.parse("pranaveda://amrita"), context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CalendarStore.CHANNEL)
            .setSmallIcon(R.drawable.ic_lotus)
            .setContentTitle("A moment for yourself")
            .setContentText("$text Amrita has a practice that fits.")
            .setStyle(NotificationCompat.BigTextStyle().bigText("$text Amrita has a practice that fits."))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        if (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            manager.notify(NOTIFICATION_ID, notification)
        }
    }

    private companion object {
        const val NOTIFICATION_ID = 4107
    }
}
