package com.pranaveda.app.ui.chat

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pranaveda.app.R
import com.pranaveda.app.model.DailyInsight
import com.pranaveda.app.model.DailyInsightStore
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface

/** What the website shows when no reflection can be loaded. */
internal const val OFFLINE_HEADLINE = "Vata season transitions"
internal const val OFFLINE_QUOTE =
    "Prana is the bridge between the body and mind. Let your breath serve as the anchor of absolute consciousness."

/** The website's "Daily Insight" card, under the greeting before a conversation starts. */
@Composable
fun DailyInsightCard(state: DailyInsightStore.State, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("DAILY INSIGHT", style = Pv.label, color = Pv.stone500, modifier = Modifier.weight(1f))
            Icon(painterResource(R.drawable.ic_compass), contentDescription = null, tint = Pv.stone500, modifier = Modifier.size(18.dp))
        }
        Crossfade(state, label = "insight") { current ->
            when (current) {
                DailyInsightStore.State.Loading -> Placeholder()
                is DailyInsightStore.State.Loaded -> Reflection(current.insight)
                DailyInsightStore.State.Unavailable -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(OFFLINE_HEADLINE, style = Pv.heading, color = Pv.ink)
                    Quote(OFFLINE_QUOTE)
                }
            }
        }
    }
}

@Composable
private fun Reflection(insight: DailyInsight) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(insight.headline, style = Pv.heading, color = Pv.ink)
        Quote(insight.quote)
        HorizontalDivider(color = Pv.stone200.copy(alpha = 0.5f))
        Column(
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.semantics(mergeDescendants = true) {
                contentDescription = "${insight.focus}. Ayurvedic tip of the day: ${insight.tip}"
            },
        ) {
            Text(insight.focus.uppercase(), style = Pv.label.copy(letterSpacing = 1.2.sp), color = Pv.lavender)
            Text(insight.tip, style = Pv.bodySmall.copy(fontStyle = FontStyle.Italic), color = Pv.stone700)
        }
    }
}

@Composable
private fun Quote(text: String) {
    Text(
        "“$text”",
        style = Pv.body.copy(fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic),
        color = Pv.stone700,
    )
}

/** Soft bars while the reflection loads, like the website's. */
@Composable
private fun Placeholder() {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.semantics { contentDescription = "Loading today's insight" },
    ) {
        listOf(0.75f, 0.85f, 0.65f).forEachIndexed { index, width ->
            Spacer(
                Modifier.fillMaxWidth(width).height(if (index == 0) 18.dp else 14.dp)
                    .background(Pv.stone200.copy(alpha = 0.6f), RoundedCornerShape(4.dp)),
            )
        }
    }
}
