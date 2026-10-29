package com.pranaveda.app.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.pranaveda.app.place.CurrentPlace
import com.pranaveda.app.place.PlaceKind
import com.pranaveda.app.ui.theme.Pv

/**
 * The suggestions under the welcome, as on the website's home screen
 * (src/App.tsx): where they are first when location is on, then two common
 * feelings, then the dosha discovery until a constitution is on file.
 */
object Suggestions {
    /** The website's words for each place (PLACE_SUGGESTION in src/hooks/usePlace.ts). */
    fun forPlace(place: CurrentPlace): String = when (place) {
        is CurrentPlace.Saved -> when (place.kind) {
            PlaceKind.Home -> "I'm at home with room to use the floor. What would you suggest?"
            PlaceKind.Work -> "I'm at work. Something quiet I can do at my desk, please."
            PlaceKind.Studio -> "I'm at the studio with a mat and space. Guide me through a fuller practice."
            PlaceKind.Outdoors -> "I'm outdoors. A standing practice I can do here, please."
        }
        CurrentPlace.Elsewhere -> "I'm out and about. Something I can do anywhere, no mat needed."
    }

    fun list(place: CurrentPlace?, knowsConstitution: Boolean): List<String> =
        listOfNotNull(place?.let(::forPlace)) + listOf(
            "I haven't been sleeping well lately",
            "I feel stressed and overwhelmed",
            if (knowsConstitution) "Help me create a morning yoga practice" else "Help me discover my dosha profile",
        )
}

/** Tapping one sends it to Amrita as their own words. Wraps, so each shows whole at large text sizes. */
@Composable
fun SuggestionChips(suggestions: List<String>, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(24.dp)
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        suggestions.forEach { text ->
            Text(
                text,
                style = Pv.body,
                color = Pv.ink,
                modifier = Modifier
                    .clip(shape)
                    .background(Color.White.copy(alpha = 0.55f))
                    .border(1.dp, Color.White.copy(alpha = 0.8f), shape)
                    .clickable(role = Role.Button) { onSelect(text) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            )
        }
    }
}
