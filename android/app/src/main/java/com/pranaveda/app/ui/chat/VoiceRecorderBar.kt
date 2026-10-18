package com.pranaveda.app.ui.chat

import com.pranaveda.app.ui.theme.rememberReduceMotion
import androidx.compose.animation.core.snap
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pranaveda.app.R
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.voice.VoiceListener
import com.pranaveda.app.voice.VoiceListener.State
import kotlinx.coroutines.delay

/**
 * The chat's input bar while speaking to Amrita: sound waves that move with
 * the voice, a clock, cancel and send. The words heard so far show in a small
 * line above it.
 */
@Composable
fun VoiceRecorderBar(listener: VoiceListener, onCancel: () -> Unit, onSend: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val words = listener.transcript.trim()
    val shape = RoundedCornerShape(28.dp)
    Column(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        when (listener.state) {
            State.NotAllowed -> TextButton(onClick = {
                context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
            }) { Text("Allow the microphone in Settings", style = Pv.caption, color = Pv.lavenderDeep) }
            State.Unavailable -> Text(
                "Speech recognition is not available right now. You can still type to Amrita.",
                style = Pv.caption,
                color = Pv.terracotta,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            else -> Text(
                words.ifEmpty { "Listening… tell Amrita how you feel" }.let { if (it.length > 140) "…" + it.takeLast(140) else it },
                style = Pv.caption.copy(fontStyle = FontStyle.Italic),
                color = if (words.isEmpty()) Pv.stone500 else Pv.stone700,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 12.dp).semantics { contentDescription = if (words.isEmpty()) "Listening" else "Heard: $words" },
            )
        }
        Row(
            Modifier.fillMaxWidth()
                .background(Color.White.copy(alpha = 0.85f), shape)
                .border(1.dp, Pv.lavender.copy(alpha = 0.5f), shape)
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FilledIconButton(
                onClick = onCancel,
                modifier = Modifier.size(44.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Pv.stone200.copy(alpha = 0.5f), contentColor = Pv.stone700),
            ) { Text("✕", style = Pv.body, modifier = Modifier.semantics { contentDescription = "Cancel recording" }) }

            if (listener.state == State.Listening) {
                SoundWaves(listener.levels, Modifier.weight(1f).height(28.dp).semantics { contentDescription = "Recording" })
                RecordingClock(listener.startedAt)
            } else {
                Text(
                    if (listener.state == State.Idle) "Paused" else "Not recording",
                    style = Pv.bodySmall,
                    color = Pv.stone500,
                    modifier = Modifier.weight(1f),
                )
            }

            FilledIconButton(
                onClick = { onSend(words) },
                enabled = words.isNotEmpty(),
                modifier = Modifier.size(44.dp),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = Pv.lavender,
                    contentColor = Color.White,
                    disabledContainerColor = Pv.lavender.copy(alpha = 0.4f),
                    disabledContentColor = Color.White,
                ),
            ) { Icon(painterResource(R.drawable.ic_send), contentDescription = "Send to Amrita") }
        }
    }
}

/** Bars that rise with the voice, newest on the right. */
@Composable
private fun SoundWaves(levels: List<Float>, modifier: Modifier = Modifier) {
    val reduceMotion = rememberReduceMotion()
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        levels.forEach { level ->
            val height by animateFloatAsState(level, if (reduceMotion) snap() else tween(120), label = "wave")
            Box(Modifier.weight(1f).fillMaxHeight(0.15f + 0.85f * height).background(Pv.lavender, CircleShape))
        }
    }
}

/** "0:07" since recording began. */
@Composable
private fun RecordingClock(startedAt: Long) {
    var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(startedAt) {
        while (true) {
            now = SystemClock.elapsedRealtime()
            delay(500)
        }
    }
    val seconds = ((now - startedAt) / 1000).coerceAtLeast(0)
    Text("%d:%02d".format(seconds / 60, seconds % 60), style = Pv.caption, color = Pv.stone500, modifier = Modifier.clearAndSetSemantics { })
}
