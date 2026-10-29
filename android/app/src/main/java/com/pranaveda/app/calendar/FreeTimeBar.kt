package com.pranaveda.app.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pranaveda.app.place.Pill
import com.pranaveda.app.ui.theme.Pv
import kotlinx.coroutines.delay
import java.time.Instant

/**
 * "You have 40 open minutes, until 9:35 PM", with Practice now, as on the
 * website's home screen (src/components/FreeTimeNudge.tsx). Shown only in
 * open calendar time the rules allow; dismissing hides it for that opening.
 */
@Composable
fun FreeTimeBar(calendar: CalendarStore, lastPracticeAt: Instant?, onPractice: (String) -> Unit) {
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            now = Instant.now()
        }
    }
    var dismissedKey by rememberSaveable { mutableStateOf<String?>(null) }
    val slot = calendar.openSlot(now, lastPracticeAt) ?: return
    if (slot.key == dismissedKey) return
    Row(
        Modifier.fillMaxWidth().background(Pv.lavenderTint.copy(alpha = 0.7f), RoundedCornerShape(16.dp)).padding(start = 14.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(FreeTime.describe(slot), style = Pv.bodySmall, color = Pv.ink, modifier = Modifier.weight(1f))
        Pill("Practice now", primary = true) { onPractice(FreeTime.practiceNow(slot)) }
        IconButton(onClick = { dismissedKey = slot.key }) {
            Text("✕", style = Pv.body, color = Pv.stone500, modifier = Modifier.semantics { contentDescription = "Dismiss" })
        }
    }
}
