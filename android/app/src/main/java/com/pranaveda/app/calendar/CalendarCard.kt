package com.pranaveda.app.calendar

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pranaveda.app.place.Pill
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface

/**
 * Turn on the phone's calendar for Amrita, and free-time reminders. The copy
 * says what she sees, because that is the promise: when, never what.
 */
@Composable
fun CalendarCard(calendar: CalendarStore) {
    val context = LocalContext.current
    val openSettings = {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
    val askForCalendar = rememberLauncherForActivityResult(RequestPermission()) { granted -> if (granted) calendar.enable() }
    var notificationsRefused by remember { mutableStateOf(false) }
    val askForNotifications = rememberLauncherForActivityResult(RequestPermission()) { granted ->
        notificationsRefused = !granted
        if (granted) calendar.setReminders(true)
    }

    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionLabel("Calendar", heading = true)
        Text("Practice that fits your day", style = Pv.heading, color = Pv.ink)
        Text(
            "PranaVeda reads this phone's calendars, including Google or Outlook ones synced to it, for when you are busy. Amrita sees only busy and free times for today and tomorrow, never what your events are. All-day events don't count as busy.",
            style = Pv.bodySmall,
            color = Pv.stone700,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                status(calendar),
                style = Pv.quote,
                color = Pv.stone700,
                modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
            )
            when {
                calendar.enabled && calendar.blocked -> Pill("Settings", primary = false) { openSettings() }
                calendar.enabled -> Pill("Turn off", primary = false) { calendar.disable() }
                else -> Pill("Turn on", primary = true) {
                    if (calendar.hasPermission()) calendar.enable() else askForCalendar.launch(Manifest.permission.READ_CALENDAR)
                }
            }
        }
        if (calendar.enabled && !calendar.blocked) {
            HorizontalDivider(color = Pv.stone200)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("Free-time reminders", style = Pv.body, color = Pv.ink)
                    Text(
                        if (notificationsRefused) "Notifications are off for PranaVeda. Allow them in Settings."
                        else "A gentle note in open time between 7 AM and 10 PM: never in a commitment, at most every three hours.",
                        style = Pv.caption,
                        color = Pv.stone500,
                    )
                }
                when {
                    notificationsRefused -> Pill("Settings", primary = false) { openSettings() }
                    calendar.remindersOn -> Pill("Turn off", primary = false, description = "Turn off free-time reminders") { calendar.setReminders(false) }
                    else -> Pill("Turn on", primary = true, description = "Turn on free-time reminders") {
                        if (Build.VERSION.SDK_INT >= 33 && !calendar.canNotify()) askForNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                        else calendar.setReminders(true)
                    }
                }
            }
        }
    }
}

private fun status(calendar: CalendarStore): String = when {
    !calendar.enabled -> "Off. Amrita doesn't know when you are busy."
    calendar.blocked -> "Calendar access is off for PranaVeda. Allow it in Settings, then come back."
    else -> calendar.contextForAmrita()?.now?.let { "$it." } ?: "Reading your calendar…"
}
