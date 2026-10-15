package com.pranaveda.app.ui.dosha

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pranaveda.app.R
import com.pranaveda.app.model.DoshaGuide
import com.pranaveda.app.model.DoshaGuideEntry
import com.pranaveda.app.model.SavedDoshaProfile
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.roundToInt

/** The balancing reference from /api/dosha-guide. */
class DoshaGuideViewModel : ViewModel() {
    var guide by mutableStateOf<DoshaGuide?>(null)
        private set
    private val api = ApiClient()

    /**
     * The screen still shows the person's own assessment without the guide;
     * it is loaded again next time the screen appears.
     */
    fun loadIfNeeded() {
        if (guide != null) return
        viewModelScope.launch {
            try {
                guide = api.doshaGuide()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
            }
        }
    }
}

/** Each dosha's look on the website: a symbol, a soft bar, a tint and a darker ink. */
enum class DoshaStyle(@DrawableRes val icon: Int, val bar: Color, val tint: Color, val ink: Color) {
    Vata(R.drawable.ic_vata, Color(0xFFB7CFFB), Pv.blueTint, Color(0xFF3B5B95)),
    Pitta(R.drawable.ic_pitta, Color(0xFFF2D0C6), Pv.peachTint, Color(0xFF7E4F41)),
    Kapha(R.drawable.ic_kapha, Color(0xFFA2E6D4), Pv.mintTint, Color(0xFF2D5A4E)),
    ;

    companion object {
        fun named(name: String) = entries.firstOrNull { it.name == name } ?: Vata
    }
}

/**
 * The person's Prakriti, as Amrita assessed it, with the classical balancing
 * reference for it (the website's Dosha Profile screen). Without an
 * assessment yet, it invites the discovery conversation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoshaScreen(profile: JsonObject, guideModel: DoshaGuideViewModel, askAmrita: (String) -> Unit) {
    LaunchedEffect(Unit) { guideModel.loadIfNeeded() }
    val dosha = SavedDoshaProfile.from(profile)
    val prakriti = runCatching { profile["prakriti"]?.jsonPrimitive?.contentOrNull }.getOrNull()
    val discoveryMessage = if (prakriti != null) "I'd like to revisit my dosha profile with you" else "Help me discover my dosha profile"

    Scaffold(
        containerColor = Color.Transparent,
        // The app's tab bar already keeps clear of the system bars.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text("Dosha", style = Pv.heading, color = Pv.ink) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            if (dosha == null) {
                Invitation(prakriti) { askAmrita(discoveryMessage) }
            } else {
                Assessed(dosha, guideModel.guide) { askAmrita(discoveryMessage) }
            }
        }
    }
}

@Composable
private fun Invitation(prakriti: String?, onBegin: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(top = 32.dp, start = 8.dp, end = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Row(
            Modifier
                .size(96.dp)
                .shadow(12.dp, CircleShape, ambientColor = Pv.lavender.copy(alpha = 0.15f), spotColor = Pv.lavender.copy(alpha = 0.2f))
                .background(Color.White.copy(alpha = 0.85f), CircleShape)
                .border(1.dp, Color.White, CircleShape),
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DoshaStyle.entries.forEach {
                Icon(painterResource(it.icon), contentDescription = null, tint = it.ink.copy(alpha = 0.7f), modifier = Modifier.size(20.dp))
            }
        }
        Text(
            if (prakriti != null) "Complete your dosha portrait" else "Discover your constitution",
            style = Pv.display.copy(fontSize = Pv.headingLarge.fontSize * 1.3f, fontStyle = FontStyle.Italic),
            color = Pv.ink,
            textAlign = TextAlign.Center,
        )
        Text(
            prakriti?.let {
                "Amrita has noted your constitution as $it, but a short conversation will complete the full portrait — your elemental balance, its meaning, and how to keep it in harmony."
            } ?: "In Ayurveda, your Prakriti is the unique balance of Vata, Pitta, and Kapha you were born with. A short conversation with Amrita — no quiz, just a few thoughtful questions — reveals yours and shapes every recommendation she makes.",
            style = Pv.body,
            color = Pv.stone700,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onBegin,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Pv.lavender, contentColor = Color.White),
        ) {
            Text("BEGIN DISCOVERY WITH AMRITA  →", style = Pv.label, modifier = Modifier.padding(vertical = 6.dp))
        }
    }
}

@Composable
private fun Assessed(dosha: SavedDoshaProfile, guide: DoshaGuide?, onRevisit: () -> Unit) {
    val reference = guide?.doshas?.get(dosha.primary)
    val secondaryReference = dosha.secondary?.let { guide?.doshas?.get(it) }

    Header(dosha, reference?.tagline)
    dosha.guidance?.takeIf { it.isNotEmpty() }?.let { Section("Amrita's guidance for you") { Bullets(it) } }

    if (reference != null) {
        Section("Understanding ${dosha.primary}", DoshaStyle.named(dosha.primary).icon) {
            Labelled("Qualities", reference.qualities)
            Labelled("Thrown off by", reference.aggravatedBy)
            Labelled("Balanced by", reference.balancedBy)
            if (dosha.secondary != null && secondaryReference != null) {
                HorizontalDivider(color = Pv.stone200.copy(alpha = 0.6f))
                Text(
                    "Your secondary ${dosha.secondary} adds: ${secondaryReference.tagline.lowercase()}. When ${dosha.primary} feels settled but something still stirs, tend the ${dosha.secondary}.",
                    style = Pv.bodySmall,
                    color = Pv.stone700,
                )
            }
        }
        Section("Nourishment (Ahara)") { Bullets(reference.diet) }
        Section("Daily rhythm (Dinacharya)") { Bullets(reference.lifestyle + reference.rhythm) }
        Section("Practice & breath") { PracticeAndBreath(reference) }
    }

    Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        guide?.note?.let { Text(it, style = Pv.caption.copy(fontStyle = FontStyle.Italic), color = Pv.stone500) }
        OutlinedButton(
            onClick = onRevisit,
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White.copy(alpha = 0.6f), contentColor = Pv.stone700),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.9f)),
        ) {
            Text("↻  REVISIT WITH AMRITA", style = Pv.label)
        }
    }
}

@Composable
private fun Header(dosha: SavedDoshaProfile, tagline: String?) {
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            "✦  YOUR PRAKRITI",
            style = Pv.label,
            color = Pv.stone700,
            modifier = Modifier.background(Pv.lavenderTint, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
        )
        Text(
            buildAnnotatedString {
                append(dosha.primary)
                dosha.secondary?.let { withStyle(SpanStyle(color = Pv.stone500)) { append(" · $it") } }
            },
            style = Pv.display,
            color = Pv.ink,
        )
        tagline?.let { Text(it, style = Pv.bodySmall, color = Pv.stone500) }
        dosha.essence?.let { Text("“$it”", style = Pv.heading.copy(fontStyle = FontStyle.Italic), color = Pv.stone700) }
        Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            BalanceBar(DoshaStyle.Vata, dosha.balance.vata)
            BalanceBar(DoshaStyle.Pitta, dosha.balance.pitta)
            BalanceBar(DoshaStyle.Kapha, dosha.balance.kapha)
        }
        SavedDoshaProfile.confidenceLine(dosha.confidence, dosha.assessedDate)?.let {
            SectionLabel(it, Modifier.align(Alignment.End))
        }
        dosha.explanation?.let {
            HorizontalDivider(color = Pv.stone200.copy(alpha = 0.6f))
            Text(it, style = Pv.bodySmall, color = Pv.stone700)
        }
    }
}

// Colour is never the only carrier of meaning: each bar is labelled with its
// name and percentage.
@Composable
private fun BalanceBar(style: DoshaStyle, percent: Double) {
    val whole = percent.roundToInt()
    Row(
        Modifier.clearAndSetSemantics { contentDescription = "${style.name} $whole percent" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            Modifier.background(style.tint, RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(painterResource(style.icon), contentDescription = null, tint = style.ink, modifier = Modifier.size(14.dp))
            Text(style.name.uppercase(), style = Pv.label, color = style.ink)
        }
        Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(Color.White.copy(alpha = 0.8f))) {
            Box(Modifier.fillMaxWidth((percent / 100).toFloat().coerceIn(0f, 1f)).height(8.dp).clip(RoundedCornerShape(4.dp)).background(style.bar))
        }
        Text("$whole%", style = Pv.caption, color = Pv.stone700)
    }
}

@Composable
private fun Section(title: String, @DrawableRes icon: Int? = null, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            icon?.let { Icon(painterResource(it), contentDescription = null, tint = Pv.lavender, modifier = Modifier.size(16.dp)) }
            SectionLabel(title)
        }
        content()
    }
}

@Composable
private fun Bullets(items: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("·", style = Pv.bodySmall, color = Pv.lavender)
                Text(item, style = Pv.bodySmall, color = Pv.ink)
            }
        }
    }
}

@Composable
private fun Labelled(label: String, text: String) {
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = Pv.ink)) { append("$label: ") }
            append(text)
        },
        style = Pv.bodySmall,
        color = Pv.stone700,
    )
}

@Composable
private fun PracticeAndBreath(reference: DoshaGuideEntry) {
    Labelled("Movement", reference.practiceStyle)
    Labelled("Breath", reference.breath)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("🌿", style = Pv.bodySmall)
        Text(reference.season, style = Pv.bodySmall, color = Pv.stone700)
    }
}
