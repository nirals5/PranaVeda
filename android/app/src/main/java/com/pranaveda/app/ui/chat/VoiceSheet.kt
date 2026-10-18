package com.pranaveda.app.ui.chat

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pranaveda.app.R
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.voice.VoiceListener
import com.pranaveda.app.voice.VoiceListener.State

/**
 * The website's voice consultation: listens as soon as it opens (asking for
 * the microphone the first time), shows the words as they are heard, and
 * sends them to Amrita as a spoken message.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceSheet(onDismiss: () -> Unit, onSend: (String) -> Unit) {
    val context = LocalContext.current
    val listener = remember { VoiceListener(context) }
    val askForMicrophone = rememberLauncherForActivityResult(RequestPermission()) { granted ->
        if (granted) listener.start() else listener.notAllowed()
    }
    LaunchedEffect(Unit) {
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            listener.start()
        } else {
            askForMicrophone.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    DisposableEffect(Unit) { onDispose { listener.release() } }

    val words = listener.transcript.trim()
    val listening = listener.state == State.Listening
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Pv.warmWhite,
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SectionLabel("✦  Voice consultation", Modifier.fillMaxWidth())
            Orb(listening) { if (listening) listener.stop() else listener.start() }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionLabel(if (listening) "Listening" else "Paused")
                Text(status(listener.state, words.isEmpty()), style = Pv.quote, color = Pv.ink, textAlign = TextAlign.Center)
            }
            Column(
                Modifier.fillMaxWidth().heightIn(min = 90.dp)
                    .background(Color.White.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("WHAT I HEARD", style = Pv.label, color = Pv.lavender)
                Text(
                    words.ifEmpty { "Speak naturally… share physical aches, restless sleep, stress, or what you want more energy for." },
                    style = Pv.bodySmall,
                    color = if (words.isEmpty()) Pv.stone500 else Pv.stone700,
                )
            }
            if (listener.state == State.NotAllowed) {
                TextButton(onClick = {
                    context.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
                    )
                }) { Text("Open Settings to allow the microphone", style = Pv.bodySmall, color = Pv.lavenderDeep) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = {
                        listener.release()
                        onDismiss()
                    },
                    modifier = Modifier.weight(1f),
                ) { Text("CANCEL", style = Pv.label, color = Pv.stone700, maxLines = 1) }
                Button(
                    onClick = {
                        listener.release()
                        onDismiss()
                        onSend(words)
                    },
                    enabled = words.isNotEmpty(),
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
                ) { Text("✓  SEND", style = Pv.label, maxLines = 1) }
            }
        }
    }
}

private fun status(state: State, nothingHeard: Boolean): String = when (state) {
    State.Listening -> "I am listening. Share what is on your mind…"
    State.Idle -> if (nothingHeard) "Tap the microphone and share what is on your mind…" else "When you are ready, send it to Amrita."
    State.NotAllowed -> "PranaVeda needs the microphone, allowed in Settings."
    State.Unavailable -> "Speech recognition is not available right now. You can still type to Amrita."
}

@Composable
private fun Orb(listening: Boolean, onTap: () -> Unit) {
    val pulse = rememberInfiniteTransition(label = "orb")
    val ring by pulse.animateFloat(1f, 1.35f, infiniteRepeatable(tween(2000), RepeatMode.Restart), label = "ring")
    // "Remove animations" in the phone's accessibility settings: a still orb.
    val resolver = LocalContext.current.contentResolver
    val reduceMotion = remember { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(150.dp)) {
        if (listening && !reduceMotion) {
            Box(
                Modifier.size(128.dp)
                    .graphicsLayer { scaleX = ring; scaleY = ring; alpha = (1.35f - ring) / 0.35f * 0.6f }
                    .border(2.dp, Pv.lavender.copy(alpha = 0.4f), CircleShape),
            )
        }
        Box(
            Modifier.size(112.dp)
                .background(Brush.linearGradient(listOf(Color.White, Pv.peachTint, Pv.lavenderTint)), CircleShape)
                .border(2.dp, Color.White, CircleShape)
                .clickable(onClick = onTap)
                .semantics { contentDescription = if (listening) "Stop listening" else "Listen again" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(painterResource(R.drawable.ic_mic), contentDescription = null, tint = Pv.lavender, modifier = Modifier.size(40.dp))
        }
    }
}
