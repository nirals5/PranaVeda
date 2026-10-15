package com.pranaveda.app.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import com.pranaveda.app.model.AnswerOption
import com.pranaveda.app.model.BreathworkPattern
import com.pranaveda.app.model.ChatCard
import com.pranaveda.app.model.DoshaProfileCard
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.model.YogaPose
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface
import kotlin.math.roundToInt

@Composable
fun CardView(card: ChatCard, onOption: (String) -> Unit) {
    when (card) {
        is ChatCard.Ritual -> RitualCard(card.result)
        is ChatCard.Breathwork -> BreathworkCard(card.note, card.pattern)
        is ChatCard.DoshaProfile -> DoshaCard(card.profile)
        is ChatCard.Options -> OptionsList(card.options, onOption)
        is ChatCard.Unsupported -> Unit
    }
}

/** Small uppercase monospace label, as on the web app's cards. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), style = Pv.label, color = Pv.stone500, modifier = modifier)
}

private val italicSmall: TextStyle = Pv.bodySmall.copy(fontStyle = FontStyle.Italic)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RitualCard(result: RecommendationResult) {
    var showingDetail by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row {
            SectionLabel("Ritual", Modifier.weight(1f))
            result.yogaPractice.durationMinutes?.let { SectionLabel("$it min") }
        }
        Text(result.yogaPractice.title, style = Pv.headingLarge, color = Pv.ink)
        result.primaryEnergy?.let { Text(it, style = italicSmall, color = Pv.lavenderDeep) }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(result.yogaPractice.poses) { PoseThumbnail(it) }
        }
        result.breathwork?.let {
            Text("🌬  ${it.name} · ${it.rhythm}", style = Pv.bodySmall, color = Pv.stone700)
        }
        Button(
            onClick = { showingDetail = true },
            colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
        ) {
            Text("BEGIN PRACTICE", style = Pv.label)
        }
    }
    if (showingDetail) {
        ModalBottomSheet(
            onDismissRequest = { showingDetail = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = Pv.warmWhite,
        ) {
            RitualDetail(result)
        }
    }
}

@Composable
private fun PoseThumbnail(pose: YogaPose) {
    Column(Modifier.width(150.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PoseImage(pose.imageUrl, Modifier.width(150.dp).height(100.dp).clip(RoundedCornerShape(12.dp)))
        Text(pose.nameEnglish, style = Pv.itemTitle, color = Pv.ink, maxLines = 2)
        pose.duration?.let { Text(it, style = Pv.caption, color = Pv.stone500) }
    }
}

/**
 * A pose picture, or a quiet placeholder while it loads or if it cannot. It
 * fills the size it is given and is cropped to it, so pictures of any shape
 * (Triangle's scene is 16:9) never spill out of their tile.
 */
@Composable
fun PoseImage(url: String?, modifier: Modifier = Modifier) {
    SubcomposeAsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier,
        loading = { Box(Modifier.background(Pv.lavenderTint)) },
        error = {
            Box(Modifier.background(Pv.lavenderTint), contentAlignment = Alignment.Center) {
                Text("🪷", color = Pv.lavender)
            }
        },
    )
}

@Composable
private fun RitualDetail(result: RecommendationResult) {
    LazyColumn(
        Modifier.fillMaxHeight(0.95f),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item { Text(result.yogaPractice.title, style = Pv.display, color = Pv.ink) }
        result.summary?.let { item { Text(it, style = Pv.body, color = Pv.stone700) } }
        itemsIndexed(result.yogaPractice.poses) { index, pose ->
            Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PoseImage(pose.imageUrl, Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(14.dp)))
                SectionLabel("Posture ${index + 1}" + (pose.duration?.let { " · $it" } ?: ""))
                Text(pose.nameEnglish, style = Pv.heading, color = Pv.ink)
                pose.nameSanskrit?.let { Text(it, style = italicSmall, color = Pv.lavenderDeep) }
                pose.instructions?.let { Text(it, style = Pv.bodySmall, color = Pv.stone700) }
            }
        }
        result.breathwork?.let { item { BreathworkCard(null, it) } }
    }
}

@Composable
private fun BreathworkCard(note: String?, pattern: BreathworkPattern) {
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionLabel("Breathwork")
        Text(pattern.name, style = Pv.heading, color = Pv.ink)
        pattern.sanskritName?.let { Text(it, style = italicSmall, color = Pv.lavenderDeep) }
        Text("${pattern.rhythm} · ${pattern.cycles} cycles", style = Pv.bodySmall, color = Pv.stone700)
        note?.let { Text(it, style = Pv.bodySmall, color = Pv.stone700) }
    }
}

@Composable
private fun DoshaCard(profile: DoshaProfileCard) {
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionLabel("Your Prakriti")
        Text(listOfNotNull(profile.primary, profile.secondary).joinToString("–"), style = Pv.headingLarge, color = Pv.ink)
        DoshaBar("Vata", profile.balance.vata, Pv.lavender)
        DoshaBar("Pitta", profile.balance.pitta, Pv.terracotta)
        DoshaBar("Kapha", profile.balance.kapha, Pv.sage)
        profile.essence?.let { Text(it, style = Pv.bodySmall, color = Pv.stone700) }
    }
}

// Colour is never the only carrier of meaning: each bar is labelled.
@Composable
private fun DoshaBar(name: String, percent: Double, color: Color) {
    val whole = percent.roundToInt()
    Row(
        Modifier.clearAndSetSemantics { contentDescription = "$name $whole%" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(name, style = Pv.bodySmall, color = Pv.ink)
        Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(Pv.stone200.copy(alpha = 0.4f))) {
            Box(
                Modifier.fillMaxWidth((percent / 100).toFloat().coerceIn(0f, 1f)).height(8.dp)
                    .clip(RoundedCornerShape(4.dp)).background(color.copy(alpha = 0.7f)),
            )
        }
        Text("$whole%", style = Pv.caption, color = Pv.ink)
    }
}

@Composable
private fun OptionsList(options: List<AnswerOption>, onPick: (String) -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { option ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(Color.White.copy(alpha = 0.7f))
                    .border(1.dp, Pv.lavenderTint, shape)
                    .clickable { onPick(option.label) }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                option.emoji?.let { Text(it, style = Pv.body) }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(option.label, style = Pv.itemTitle, color = Pv.ink)
                    option.description?.let { Text(it, style = Pv.caption, color = Pv.stone500) }
                }
            }
        }
    }
}
