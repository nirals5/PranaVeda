package com.pranaveda.app.health

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Recovery & Trends, part two: sleep, resting heart rate and HRV from Health
 * Connect over the last 14 days, with practice days shaded, so how practice
 * and recovery move together shows at a glance. Real readings only.
 */
@Composable
fun HealthTrendsSection(health: HealthStore, practiceDays: Set<String>) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val askToRead = rememberLauncherForActivityResult(HealthStore.permissionContract()) { scope.launch { health.load() } }
    LaunchedEffect(Unit) { health.load() }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Heart & sleep", style = Pv.heading, color = Pv.ink, modifier = Modifier.semantics { heading() })
        when (val state = health.state) {
            is HealthStore.State.Unavailable -> {
                Text(
                    if (state.needsUpdate) "Health Connect needs an update before PranaVeda can read from it." else "Health Connect is not available on this phone.",
                    style = Pv.bodySmall,
                    color = Pv.stone700,
                )
                if (state.needsUpdate) {
                    Button(
                        onClick = {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding"))
                                    .setPackage("com.android.vending").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
                    ) { Text("UPDATE HEALTH CONNECT", style = Pv.label) }
                }
            }
            HealthStore.State.NotConnected, HealthStore.State.Failed -> {
                Text(
                    "See your sleep, resting heart rate and heart-rate variability beside your practice. PranaVeda reads them from Health Connect on this phone, and they stay on it unless you choose to let Amrita see them.",
                    style = Pv.bodySmall,
                    color = Pv.stone700,
                )
                Button(
                    onClick = { askToRead.launch(HealthStore.PERMISSIONS) },
                    colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
                ) { Text("CONNECT HEALTH CONNECT", style = Pv.label) }
                if (state == HealthStore.State.Failed) {
                    Text("Health Connect could not be read just now. Please try again.", style = Pv.caption, color = Pv.terracotta)
                }
            }
            HealthStore.State.Loading -> CircularProgressIndicator(color = Pv.lavender)
            is HealthStore.State.Loaded -> {
                if (state.days.all { it.isEmpty }) {
                    Text(
                        "No sleep or heart readings in Health Connect for the last two weeks. A watch, ring or sleep app records them once it shares with Health Connect.",
                        style = Pv.bodySmall,
                        color = Pv.stone700,
                    )
                } else {
                    Text("Shaded days: you practised.", style = Pv.caption, color = Pv.stone500)
                    Metric("Sleep", state.days.lastOrNull { it.sleepMinutes != null }?.sleepMinutes?.let(HealthTrends::hours), state.days, practiceDays, "hours", bars = true) {
                        it.sleepMinutes?.let { minutes -> minutes / 60.0 }
                    }
                    Metric("Resting heart rate", state.days.lastOrNull { it.restingHeartRate != null }?.restingHeartRate?.let { "${it.roundToInt()} bpm" }, state.days, practiceDays, "beats per minute", bars = false) { it.restingHeartRate }
                    Metric("Heart-rate variability (RMSSD)", state.days.lastOrNull { it.hrv != null }?.hrv?.let { "${it.roundToInt()} ms" }, state.days, practiceDays, "milliseconds", bars = false) { it.hrv }
                }
                ShareWithAmrita(health)
            }
        }
    }
}

/** The opt-in: off until they turn it on. */
@Composable
private fun ShareWithAmrita(health: HealthStore) {
    Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth().toggleable(value = health.sharesWithAmrita, role = Role.Switch, onValueChange = health::shareWithAmrita),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Let Amrita see my sleep and heart readings", style = Pv.body, color = Pv.ink, modifier = Modifier.weight(1f))
            Switch(
                checked = health.sharesWithAmrita,
                onCheckedChange = null,
                colors = SwitchDefaults.colors(checkedTrackColor = Pv.lavender),
            )
        }
        Text(
            "With each message, Amrita gets a short summary: last night's sleep, resting heart rate and heart-rate variability, each beside your usual. It goes to PranaVeda's server and to Amrita, which runs on Anthropic's Claude, and PranaVeda does not store it. Off, your readings stay on this phone.",
            style = Pv.caption,
            color = Pv.stone500,
        )
    }
}

/** One measure over the 14 days: bars for sleep, a line for heart readings; practice days shaded behind. */
@Composable
private fun Metric(
    title: String,
    latest: String?,
    days: List<HealthDay>,
    practiceDays: Set<String>,
    unit: String,
    bars: Boolean,
    value: (HealthDay) -> Double?,
) {
    val readings = days.map(value)
    val present = readings.filterNotNull()
    val label = DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())
    val description = days.zip(readings).filter { it.second != null }.joinToString("; ") { (day, v) ->
        "${day.date.format(label)}: ${if (bars) "%.1f".format(v) else v!!.roundToInt().toString()} $unit${if (day.date.toString() in practiceDays) ", practised" else ""}"
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth()) {
            SectionLabel(title, Modifier.weight(1f))
            latest?.let { Text(it, style = Pv.bodySmall, color = Pv.ink) }
        }
        if (present.isEmpty()) {
            Text("No readings", style = Pv.caption, color = Pv.stone500)
            return@Column
        }
        val top = present.max()
        val bottom = if (bars) 0.0 else present.min()
        val span = (top - bottom).takeIf { it > 0 } ?: 1.0
        Canvas(Modifier.fillMaxWidth().height(90.dp).semantics { contentDescription = "$title, last 14 days. $description" }) {
            val slot = size.width / days.size
            days.forEachIndexed { i, day ->
                if (day.date.toString() in practiceDays) drawRect(Pv.lavenderTint.copy(alpha = 0.7f), Offset(i * slot, 0f), Size(slot, size.height))
            }
            val pad = 8.dp.toPx()
            fun y(v: Double) = (size.height - pad - ((v - bottom) / span * (size.height - 2 * pad))).toFloat()
            if (bars) {
                readings.forEachIndexed { i, v ->
                    if (v != null) {
                        val top = (size.height - (v / top * (size.height - pad))).toFloat()
                        drawRect(Pv.lavender, Offset(i * slot + slot * 0.2f, top), Size(slot * 0.6f, size.height - top))
                    }
                }
            } else {
                val points = readings.mapIndexedNotNull { i, v -> v?.let { Offset(i * slot + slot / 2, y(it)) } }
                val line = Path().apply { points.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
                drawPath(line, Pv.lavender, style = Stroke(width = 2.dp.toPx()))
                points.forEach { drawCircle(Pv.lavenderDeep, radius = 3.dp.toPx(), center = it) }
            }
        }
        Row(Modifier.fillMaxWidth()) {
            Text(days.first().date.format(label), style = Pv.caption, color = Pv.stone500)
            Spacer(Modifier.weight(1f))
            Text("Today", style = Pv.caption, color = Pv.stone500)
        }
    }
}
