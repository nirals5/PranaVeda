package com.pranaveda.app.place

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface

/**
 * Turn location on, then mark the spots that matter, as on the website.
 * Amrita learns only the kind of place (home, work, …); the copy says so,
 * because that is the promise.
 */
@Composable
fun LocationCard(place: PlaceStore, arrival: ArrivalStore) {
    val context = LocalContext.current
    val openSettings = {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
    // Whatever they allow, turning on proceeds: the store notices a refusal
    // (blocked) or approximate-only, and the status line says so.
    val askForLocation = rememberLauncherForActivityResult(RequestMultiplePermissions()) { place.enable() }

    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionLabel("Location", heading = true)
        Text("A practice that fits where you are", style = Pv.heading, color = Pv.ink)
        Text(
            "While PranaVeda is open, it checks where you are against spots you save here. Amrita is told only the kind of place, such as home or work. No history is kept, and your saved spots stay on this phone unless you keep them on your account (above).",
            style = Pv.bodySmall,
            color = Pv.stone700,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                status(place),
                style = Pv.quote,
                color = Pv.stone700,
                modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
            )
            when {
                place.enabled && place.blocked -> Pill("Settings", primary = false) { openSettings() }
                place.enabled -> Pill("Turn off", primary = false) { place.disable() }
                else -> Pill("Turn on", primary = true) {
                    if (place.hasPermission()) place.enable() else askForLocation.launch(PlaceStore.PERMISSIONS)
                }
            }
        }
        if (place.enabled && !place.blocked) {
            PlaceKind.entries.forEach { kind ->
                HorizontalDivider(color = Pv.stone200)
                PlaceRow(place, kind)
            }
            if (place.places.any { it.kind in Arrival.KINDS }) {
                HorizontalDivider(color = Pv.stone200)
                ArrivalRow(arrival, openSettings)
            }
        }
    }
}

private fun status(place: PlaceStore): String = when {
    !place.enabled -> "Off. Amrita does not know where you are."
    place.blocked -> "Location is off for PranaVeda. Allow it in Settings, then come back."
    !place.located -> "Finding where you are…"
    place.imprecise && place.approximateOnly ->
        "PranaVeda can see only your approximate location, too vague to tell your places apart. Allow precise location for PranaVeda in Settings."
    place.imprecise -> "Your phone can only give a rough area right now, too vague to tell your places apart."
    else -> place.current?.let { "Right now: ${it.label}." } ?: "Located. Save the spot you are in below so Amrita can recognise it."
}

/** Arrival reminders, once a place that takes them is saved: notifications, then location "all the time". */
@Composable
private fun ArrivalRow(arrival: ArrivalStore, openSettings: () -> Unit) {
    var notificationsRefused by remember { mutableStateOf(false) }
    // Whatever they choose for "all the time", it turns on; the row says what's missing.
    val askForAllTheTime = rememberLauncherForActivityResult(RequestPermission()) { arrival.turn(true) }
    val askForLocation = {
        if (Build.VERSION.SDK_INT >= 29 && !arrival.canWatch()) askForAllTheTime.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        else arrival.turn(true)
    }
    val askForNotifications = rememberLauncherForActivityResult(RequestPermission()) { granted ->
        notificationsRefused = !granted
        if (granted) askForLocation()
    }
    // The wording is long, so it gets the full width and the buttons sit below it.
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column {
            Text("Arrival reminders", style = Pv.heading.copy(fontSize = Pv.body.fontSize), color = Pv.ink)
            Text(
                when {
                    notificationsRefused -> "Notifications are off for PranaVeda. Allow them in Settings."
                    arrival.on && arrival.needsAllTheTime ->
                        "Set Location to \"Allow all the time\", with precise location, for PranaVeda in Settings, so your phone can notice when you arrive."
                    else -> "A gentle note when you arrive home, at the studio or at your outdoor spot and stay a few minutes. Your phone notices the arrival, even with PranaVeda closed. Between 7 AM and 10 PM, at most every three hours."
                },
                style = Pv.caption,
                color = Pv.stone500,
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
            if (notificationsRefused || (arrival.on && arrival.needsAllTheTime)) Pill("Settings", primary = false) { openSettings() }
            if (!notificationsRefused) {
                if (arrival.on) {
                    Pill("Turn off", primary = false, description = "Turn off arrival reminders") { arrival.turn(false) }
                } else {
                    Pill("Turn on", primary = true, description = "Turn on arrival reminders") {
                        if (Build.VERSION.SDK_INT >= 33 && !arrival.canNotify()) askForNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                        else askForLocation()
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaceRow(place: PlaceStore, kind: PlaceKind) {
    val saved = place.places.any { it.kind == kind }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            Text(kind.label, style = Pv.heading.copy(fontSize = Pv.body.fontSize), color = Pv.ink)
            Text(
                when {
                    !saved -> "Not saved yet."
                    place.current == CurrentPlace.Saved(kind) -> "Saved. You are here now."
                    else -> "Saved."
                },
                style = Pv.caption,
                color = Pv.stone500,
            )
        }
        Pill(
            if (saved) "Move here" else "I am here",
            primary = !saved,
            enabled = place.located && !place.imprecise,
            description = "${if (saved) "Move" else "Save"} ${kind.label} to where I am now",
        ) { place.save(kind) }
        if (saved) Pill("Remove", primary = false, description = "Remove ${kind.label}") { place.remove(kind) }
    }
}

/** The website's small rounded action buttons. */
@Composable
internal fun Pill(text: String, primary: Boolean, enabled: Boolean = true, description: String? = null, onClick: () -> Unit) {
    val modifier = if (description != null) Modifier.semantics { contentDescription = description } else Modifier
    val padding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
    if (primary) {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier,
            contentPadding = padding,
            colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
        ) { Text(text.uppercase(), style = Pv.label, maxLines = 1) }
    } else {
        OutlinedButton(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier,
            contentPadding = padding,
            border = BorderStroke(1.dp, Pv.stone200),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White.copy(alpha = 0.6f), contentColor = Pv.stone700),
        ) { Text(text.uppercase(), style = Pv.label, maxLines = 1) }
    }
}
