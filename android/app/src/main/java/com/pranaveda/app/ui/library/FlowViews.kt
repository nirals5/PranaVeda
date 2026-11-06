package com.pranaveda.app.ui.library

import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.pranaveda.app.model.Flow
import com.pranaveda.app.ui.chat.PoseImage
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface

/** A flow's tile in Library → Flows: its cover with a play mark, title and length. */
@Composable
internal fun FlowTile(flow: Flow, onClick: () -> Unit) {
    Column(
        Modifier
            .clickable(onClick = onClick)
            .semantics { contentDescription = "Play ${flow.title}, ${flow.minutes} minutes" },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            PoseImage(flow.coverUrl, Modifier.fillMaxWidth().height(110.dp).clip(RoundedCornerShape(12.dp)))
            PlayMark(40)
        }
        Text(flow.title, style = Pv.itemTitle, color = Pv.ink, maxLines = 2)
        SectionLabel("${flow.minutes} min")
    }
}

/** On a pose page: the flows that feature the pose. */
@Composable
internal fun PoseFlowLinks(flows: List<Flow>, onPlay: (Flow) -> Unit) {
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("Watch a flow with this pose")
        flows.forEach { flow ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onPlay(flow) }
                    .semantics { contentDescription = "Play ${flow.title}, ${flow.minutes} minutes" },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                PoseImage(flow.coverUrl, Modifier.width(88.dp).height(50.dp).clip(RoundedCornerShape(8.dp)))
                Column(Modifier.weight(1f)) {
                    Text(flow.title, style = Pv.bodySmall, color = Pv.ink)
                    Text("${flow.minutes} min", style = Pv.caption, color = Pv.stone500)
                }
                PlayMark(32)
            }
        }
    }
}

@Composable
private fun PlayMark(size: Int) {
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.85f)),
        contentAlignment = Alignment.Center,
    ) {
        Text("▶", style = Pv.bodySmall, color = Pv.lavender)
    }
}

/** One flow, full screen with the system media controls. */
@Composable
internal fun FlowPlayer(flow: Flow, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(
                factory = { context ->
                    VideoView(context).apply {
                        val controls = MediaController(context)
                        controls.setAnchorView(this)
                        setMediaController(controls)
                        setVideoURI(Uri.parse(flow.videoUrl))
                        setOnPreparedListener { start(); controls.show() }
                    }
                },
                onRelease = { it.stopPlayback() },
                modifier = Modifier.align(Alignment.Center).fillMaxWidth(),
            )
            Box(
                Modifier
                    .align(Alignment.TopStart)
                    .padding(16.dp)
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.5f))
                    .clickable(onClick = onClose)
                    .semantics { contentDescription = "Close" },
                contentAlignment = Alignment.Center,
            ) {
                Text("✕", style = Pv.body, color = Color.White)
            }
        }
    }
}
