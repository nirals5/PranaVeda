package com.pranaveda.app.practice

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.pranaveda.app.MainActivity
import com.pranaveda.app.R

/**
 * The practice that is running, as a silent ongoing notification: the pose or
 * breath phase, where you are in the practice, and a countdown that runs on its
 * own. On Android 16 it is also asked to show as a Live Update (the status-bar
 * chip). Tapping it returns to the practice. Cancelled when the practice ends.
 */
class PracticeNotice(private val context: Context) {
    /** What the notification says; worked out apart from Android so it can be tested. */
    data class Content(
        val title: String,
        val text: String,
        /** When the countdown reaches zero, or null while paused. */
        val endsAtMillis: Long?,
        /** The short status-bar chip text while paused ("1:05"); null while running, as the chip counts down. */
        val pausedChip: String?,
    )

    fun show(practice: String, step: String, detail: String, secondsLeft: Int, running: Boolean, nowMillis: Long = System.currentTimeMillis()) {
        if (!canPost(context)) return
        ensureChannel(context)
        val content = content(practice, step, detail, secondsLeft, running, nowMillis)
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_lotus)
            .setContentTitle(content.title)
            .setContentText(content.text)
            .setContentIntent(open)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setRequestPromotedOngoing(true)
        if (content.endsAtMillis != null) {
            builder.setWhen(content.endsAtMillis).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
        } else {
            builder.setShowWhen(false).setShortCriticalText(content.pausedChip)
        }
        try {
            NotificationManagerCompat.from(context).notify(ID, builder.build())
        } catch (_: SecurityException) {
            // Notifications were switched off between the check and the post.
        }
    }

    fun cancel() = NotificationManagerCompat.from(context).cancel(ID)

    companion object {
        const val CHANNEL = "practice"
        const val ID = 7

        fun content(practice: String, step: String, detail: String, secondsLeft: Int, running: Boolean, nowMillis: Long) = Content(
            title = step,
            text = if (running) "$practice · $detail" else "Paused · ${clockString(secondsLeft)} left · $detail",
            endsAtMillis = if (running) nowMillis + secondsLeft * 1000L else null,
            pausedChip = if (running) null else clockString(secondsLeft),
        )

        fun canPost(context: Context) = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        private fun ensureChannel(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(CHANNEL) != null) return
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Practice in progress", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "The pose or breath and time left while a practice runs."
                    setShowBadge(false)
                },
            )
        }
    }
}

/** A [PracticeNotice] for a practice screen, cancelled when the screen closes. */
@Composable
fun rememberPracticeNotice(): PracticeNotice {
    val context = LocalContext.current
    val notice = remember { PracticeNotice(context.applicationContext) }
    DisposableEffect(notice) { onDispose { notice.cancel() } }
    return notice
}

/**
 * The first practice asks once for permission to show notifications (Android 13+),
 * then calls [onAllowed] so the notice appears straight away.
 */
@Composable
fun AskForPracticeNotifications(onAllowed: () -> Unit) {
    val context = LocalContext.current
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed -> if (allowed) onAllowed() }
    LaunchedEffect(Unit) {
        val prefs = context.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)
        if (!PracticeNotice.canPost(context) && !prefs.getBoolean(ASKED_KEY, false)) {
            prefs.edit().putBoolean(ASKED_KEY, true).apply()
            ask.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

private const val ASKED_KEY = "practice.notificationsAsked"
