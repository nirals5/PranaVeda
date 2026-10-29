package com.pranaveda.app

import com.pranaveda.app.place.CurrentPlace
import com.pranaveda.app.place.PlaceKind
import com.pranaveda.app.ui.chat.Suggestions
import org.junit.Assert.assertEquals
import org.junit.Test

/** The suggestions under the welcome: the website's (src/App.tsx), with where they are first when location is on. */
class SuggestionTest {
    @Test fun whereTheyAreComesFirstInTheWebsitesWords() {
        assertEquals(
            listOf(
                "I'm at work. Something quiet I can do at my desk, please.",
                "I haven't been sleeping well lately",
                "I feel stressed and overwhelmed",
                "Help me discover my dosha profile",
            ),
            Suggestions.list(CurrentPlace.Saved(PlaceKind.Work), knowsConstitution = false),
        )
        assertEquals("I'm at home with room to use the floor. What would you suggest?", Suggestions.forPlace(CurrentPlace.Saved(PlaceKind.Home)))
        assertEquals("I'm out and about. Something I can do anywhere, no mat needed.", Suggestions.forPlace(CurrentPlace.Elsewhere))
    }

    @Test fun nothingAboutPlaceWithoutLocationAndAMorningPracticeOnceTheirConstitutionIsKnown() {
        assertEquals(
            listOf("I haven't been sleeping well lately", "I feel stressed and overwhelmed", "Help me create a morning yoga practice"),
            Suggestions.list(null, knowsConstitution = true),
        )
    }
}
