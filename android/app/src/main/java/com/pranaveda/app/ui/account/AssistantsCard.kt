package com.pranaveda.app.ui.account

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.pranaveda.app.MainActivity
import com.pranaveda.app.R
import com.pranaveda.app.model.Assistants
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.place.Pill
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface

/**
 * Which assistants reach PranaVeda, what to say or press, and how to set each
 * up. Google's assistant can't be given phrases for PranaVeda, so the phone
 * row is the long-press menu, which can also go on the home screen. Alexa
 * appears only once the skill is published. Nothing is linked to the account.
 */
@Composable
fun AssistantsCard(api: ApiClient = remember { ApiClient() }) {
    val context = LocalContext.current
    var alexa by remember { mutableStateOf<Assistants.Alexa?>(null) }
    LaunchedEffect(api) { alexa = runCatching { api.assistants().alexa }.getOrNull() }
    val canPin = remember { ShortcutManagerCompat.isRequestPinShortcutSupported(context) }

    Column(Modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionLabel("Smart assistants", heading = true)
        Text("Practise without opening the app", style = Pv.heading, color = Pv.ink)
        Text(
            "Touch and hold the PranaVeda icon for these, or put Start my practice on your home screen.",
            style = Pv.bodySmall,
            color = Pv.stone700,
        )
        Assistant("On this phone", Assistants.PHONE_SHORTCUTS) {
            if (canPin) {
                Pill("Add to home screen", primary = false) {
                    // The same shortcut as the long-press menu (id "practice"), pinned.
                    val info = ShortcutInfoCompat.Builder(context, "practice")
                        .setShortLabel(context.getString(R.string.shortcut_practice))
                        .setLongLabel(context.getString(R.string.shortcut_practice_long))
                        .setIcon(IconCompat.createWithResource(context, R.drawable.ic_shortcut_practice))
                        .setIntent(Intent(Intent.ACTION_VIEW, Uri.parse("pranaveda://practice"), context, MainActivity::class.java))
                        .build()
                    ShortcutManagerCompat.requestPinShortcut(context, info, null)
                }
            }
        }
        alexa?.let { skill ->
            HorizontalDivider(color = Pv.stone200)
            Assistant("Alexa", skill.phrases) {
                Pill("Enable in the Alexa app", primary = false) {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(skill.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
        }
    }
}

@Composable
private fun Assistant(name: String, phrases: List<String>, action: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(name, style = Pv.body.copy(fontWeight = FontWeight.SemiBold), color = Pv.ink)
        Column(
            Modifier.semantics { contentDescription = "$name: " + phrases.joinToString(". ") },
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            phrases.forEach { Text("“$it”", style = Pv.quote.copy(fontStyle = FontStyle.Italic), color = Pv.stone700) }
        }
        action()
    }
}
