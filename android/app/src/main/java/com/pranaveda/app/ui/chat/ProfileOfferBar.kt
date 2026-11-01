package com.pranaveda.app.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pranaveda.app.model.ProfileOffer
import com.pranaveda.app.place.Pill
import com.pranaveda.app.ui.theme.Pv
import kotlinx.coroutines.launch

/**
 * Details this phone has that the account doesn't (see [ProfileOffer]), as on
 * the website's home screen. They stay out of sight until Review, then open in
 * place.
 */
@Composable
fun ProfileOfferBar(model: ChatViewModel, offer: ProfileOffer) {
    var open by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(
        Modifier.fillMaxWidth().background(Pv.lavenderTint.copy(alpha = 0.7f), RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(offer.summary, style = Pv.bodySmall, color = Pv.ink, modifier = Modifier.weight(1f))
            if (!open) Pill("Review", primary = true) { open = true }
        }
        if (open) {
            offer.items.forEach { Text("• $it", style = Pv.bodySmall, color = Pv.ink) }
            if (failed) Text("That couldn't be saved. Please try again.", style = Pv.bodySmall, color = Pv.stone700)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("Add to my account", primary = true, enabled = !saving) {
                    saving = true
                    failed = false
                    scope.launch {
                        failed = !model.addProfileOffer()
                        saving = false
                    }
                }
                Pill("Not now", primary = false, enabled = !saving) { model.declineProfileOffer(offer) }
            }
        }
    }
}
