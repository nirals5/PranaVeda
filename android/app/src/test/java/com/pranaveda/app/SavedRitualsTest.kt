package com.pranaveda.app

import com.pranaveda.app.model.PvJson
import com.pranaveda.app.model.RecommendationResult
import com.pranaveda.app.model.SavedRitual
import com.pranaveda.app.model.SavedRitualStore
import com.pranaveda.app.model.YogaPractice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

class SavedRitualsTest {
    private fun ritual(title: String) = RecommendationResult(
        summary = "For $title",
        primaryEnergy = "Scattered Wind",
        yogaPractice = YogaPractice(title = title, poses = emptyList(), durationMinutes = 10),
    )

    // Writes happen at once on the test thread, so a reopened store reads them.
    private val dispatcher = UnconfinedTestDispatcher()
    private val scope = CoroutineScope(dispatcher)

    private fun freshStore(file: File = File.createTempFile("saved", ".json").also { it.delete() }) =
        SavedRitualStore(file, scope, writer = dispatcher) to file

    @Test fun savesNewestFirstAndKeepsThemAcrossLaunches() {
        val (store, file) = freshStore()
        val now = Instant.parse("2026-10-17T18:00:00Z")
        assertTrue(store.toggle(ritual("Morning"), now))
        assertTrue(store.toggle(ritual("Evening"), now.plusSeconds(60)))
        assertEquals(listOf("Evening", "Morning"), store.rituals.map { it.title })
        assertTrue(store.rituals.first().id.startsWith("save_${now.toEpochMilli() + 60_000}_"))
        assertTrue(store.isSaved(ritual("Morning")))
        assertFalse(store.isSaved(ritual("Midday")))
        assertEquals(listOf("Evening", "Morning"), SavedRitualStore(file, scope, dispatcher).rituals.map { it.title })
    }

    @Test fun savingTheSameRitualAgainRemovesIt() {
        val (store, _) = freshStore()
        store.toggle(ritual("Morning"))
        assertFalse(store.toggle(ritual("Morning")))
        assertTrue(store.rituals.isEmpty())
    }

    @Test fun removesOneEvenWhenSavedInTheSameMillisecond() {
        val (store, file) = freshStore()
        val now = Instant.parse("2026-10-17T18:00:00Z")
        store.toggle(ritual("Morning"), now)
        store.toggle(ritual("Evening"), now)
        store.remove(store.rituals[0])
        assertEquals(listOf("Morning"), store.rituals.map { it.title })
        assertEquals(listOf("Morning"), SavedRitualStore(file, scope, dispatcher).rituals.map { it.title })
    }

    @Test fun readsTheWebsitesShape() {
        val json = """[{"id":"temp_1","title":"Grounding","date":"Oct 12","query":"I feel scattered","category":"Yoga",
            "result":{"summary":"s","yogaPractice":{"title":"Grounding","poses":[]}}}]"""
        val saved = PvJson.decodeFromString(ListSerializer(SavedRitual.serializer()), json)
        assertEquals("I feel scattered", saved.first().query)
        assertEquals("Oct 17", SavedRitualStore.savedDate(Instant.parse("2026-10-17T18:00:00Z"), ZoneId.of("America/Los_Angeles"), Locale.US))
    }
}
