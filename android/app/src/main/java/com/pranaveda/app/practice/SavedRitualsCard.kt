package com.pranaveda.app.practice

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.pranaveda.app.PranaVedaApplication
import com.pranaveda.app.R
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.model.SavedRitual
import com.pranaveda.app.model.SavedRitualStore
import com.pranaveda.app.ui.chat.SectionLabel
import com.pranaveda.app.ui.theme.Pv
import com.pranaveda.app.ui.theme.cardSurface

@Composable
fun savedRitualStore(): SavedRitualStore = (LocalContext.current.applicationContext as PranaVedaApplication).saved

/**
 * The website's "Saved Rituals" card: bookmarked rituals, newest first, each
 * opening again. With a [limit], only the newest few (the chat's welcome).
 */
@Composable
fun SavedRitualsCard(
    saved: SavedRitualStore,
    onOpen: (RecommendationResult) -> Unit,
    modifier: Modifier = Modifier,
    limit: Int? = null,
) {
    val shown = limit?.let { saved.rituals.take(it) } ?: saved.rituals
    Column(modifier.fillMaxWidth().cardSurface(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionLabel("Saved rituals", Modifier.weight(1f), heading = true)
            Icon(painterResource(R.drawable.ic_bookmark), contentDescription = null, tint = Pv.stone500, modifier = Modifier.size(18.dp))
        }
        if (shown.isEmpty()) {
            Text(
                "No bookmarked rituals. Tap the bookmark on a ritual Amrita creates to keep it here.",
                style = Pv.bodySmall,
                color = Pv.stone700,
            )
            return@Column
        }
        shown.forEachIndexed { index, ritual ->
            SavedRow(ritual, onOpen = { onOpen(ritual.result) }, onRemove = { saved.remove(ritual) })
            if (index < shown.lastIndex) HorizontalDivider(color = Pv.stone200.copy(alpha = 0.5f))
        }
        if (limit != null && saved.rituals.size > limit) {
            Text("${saved.rituals.size} saved · all of them are in the You tab", style = Pv.caption, color = Pv.stone500)
        }
    }
}

@Composable
private fun SavedRow(ritual: SavedRitual, onOpen: () -> Unit, onRemove: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.weight(1f)
                .clickable(onClickLabel = "Open this ritual", onClick = onOpen)
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier.size(30.dp).background(Pv.lavenderTint.copy(alpha = 0.7f), RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(painterResource(R.drawable.ic_play), contentDescription = null, tint = Pv.lavenderDeep, modifier = Modifier.size(16.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(ritual.title, style = Pv.itemTitle, color = Pv.ink, maxLines = 2)
                Text(
                    listOfNotNull(ritual.result.primaryEnergy, ritual.date).joinToString(" · "),
                    style = Pv.caption,
                    color = Pv.stone500,
                    maxLines = 1,
                )
            }
        }
        IconButton(onClick = onRemove) {
            Icon(
                painterResource(R.drawable.ic_delete),
                contentDescription = "Remove ${ritual.title} from saved rituals",
                tint = Pv.stone500,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/** Saves or unsaves a ritual (the website's "Bookmark Ritual"). */
@Composable
fun BookmarkButton(result: RecommendationResult, modifier: Modifier = Modifier) {
    val saved = savedRitualStore()
    val view = LocalView.current
    val isSaved = saved.isSaved(result)
    IconButton(
        onClick = {
            val nowSaved = saved.toggle(result)
            view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
            view.announceForAccessibility(if (nowSaved) "Ritual saved" else "Removed from saved rituals")
        },
        modifier = modifier,
    ) {
        Icon(
            painterResource(if (isSaved) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark),
            contentDescription = if (isSaved) "Saved. Remove from saved rituals" else "Save ritual",
            tint = Pv.lavenderDeep,
        )
    }
}
