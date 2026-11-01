package com.pranaveda.app.health

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.place.Pill
import com.pranaveda.app.ui.theme.Pv

/** Finding, checking and forgetting a heart-rate sensor, all in place under Heart & sleep. */
@Composable
fun HeartSensorRow() {
    val sensor = (LocalContext.current.applicationContext as PranaVedaApplication).heartSensor
    var searched by remember { mutableStateOf(false) }
    var refused by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }

    fun search() {
        searched = true
        refused = false
        sensor.startScan()
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { answers ->
        if (answers.values.all { it }) search() else refused = true
    }

    DisposableEffect(Unit) { onDispose { sensor.stopScan() } }
    DisposableEffect(checking) {
        if (checking) sensor.hold()
        onDispose { if (checking) sensor.release() }
    }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Heart rate during a practice", style = Pv.body, color = Pv.ink)
        val name = sensor.sensorName
        if (name != null) {
            Text(
                when {
                    !checking -> "$name is ready for your next practice."
                    sensor.bpm != null -> "$name: ${sensor.bpm} bpm"
                    else -> "Looking for $name. Check it's on and worn."
                },
                style = Pv.bodySmall,
                color = Pv.stone700,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(if (checking) "Stop checking" else "Check reading", primary = false) { checking = !checking }
                Pill("Forget", primary = false) {
                    checking = false
                    searched = false
                    sensor.forget()
                }
            }
        } else {
            Text("Connect a Bluetooth chest strap or arm band to see live readings as you practise. These are wellness signals, not medical measurements.", style = Pv.bodySmall, color = Pv.stone700)
            when {
                refused -> Text("PranaVeda needs Bluetooth permission to find a sensor. You can allow it in the phone's settings.", style = Pv.caption, color = Pv.terracotta)
                searched && !sensor.bluetoothIsOn -> Text("Turn on Bluetooth to find a sensor.", style = Pv.caption, color = Pv.terracotta)
                searched && !sensor.isScanning && sensor.found.isEmpty() -> Text("No sensor found. Check it's on and worn, and closed in its own app.", style = Pv.caption, color = Pv.terracotta)
            }
            sensor.found.forEach { found ->
                Text(
                    found.name,
                    style = Pv.body,
                    color = Pv.lavenderDeep,
                    modifier = Modifier.fillMaxWidth().clickable {
                        sensor.choose(found)
                        searched = false
                        checking = true
                    }.padding(vertical = 8.dp),
                )
            }
            Pill(if (sensor.isScanning) "Searching…" else "Find a sensor", primary = true, enabled = !sensor.isScanning) {
                if (sensor.hasPermission) search() else ask.launch(HeartSensor.PERMISSIONS)
            }
        }
    }
}
