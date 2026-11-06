package com.pranaveda.app

import com.pranaveda.app.model.BreathworkPattern
import com.pranaveda.app.model.YogaPose
import com.pranaveda.app.practice.Guidance
import com.pranaveda.app.practice.GuidanceAudio
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/** Amrita's voice for guided practice: asked for once, fetched ahead, given up on cleanly. */
class GuidanceAudioTest {
    @Test fun asksForEachLineOnceAndKeepsIt() = runTest {
        val asked = mutableListOf<String>()
        val audio = GuidanceAudio(backgroundScope) { asked += it; it.toByteArray() }
        assertArrayEquals("Breathe in".toByteArray(), audio.audio("Breathe in"))
        assertArrayEquals("Breathe in".toByteArray(), audio.audio("Breathe in"))
        assertEquals(listOf("Breathe in"), asked)
    }

    @Test fun withNoVoiceConfiguredTheRestIsTheBuiltInVoice() = runTest {
        val asked = mutableListOf<String>()
        val audio = GuidanceAudio(backgroundScope) { asked += it; null }
        assertNull(audio.audio("Breathe in"))
        assertNull(audio.audio("Exhale slowly"))
        assertEquals(listOf("Breathe in"), asked)
        assertTrue(audio.builtInOnly)
    }

    @Test fun oneFailureIsForgivenTwoAreNot() = runTest {
        val asked = mutableListOf<String>()
        val audio = GuidanceAudio(backgroundScope) { asked += it; throw IOException("offline") }
        assertNull(audio.audio("one"))
        assertFalse(audio.builtInOnly)
        assertNull(audio.audio("two"))
        assertTrue(audio.builtInOnly)
        assertNull(audio.audio("three"))
        assertEquals(listOf("one", "two"), asked)
    }

    @Test fun fetchesAheadInOrderWithoutRepeats() = runTest {
        val asked = mutableListOf<String>()
        val audio = GuidanceAudio(backgroundScope) { asked += it; it.toByteArray() }
        audio.prefetch(listOf("Breathe in", "Hold", "Breathe in", "", "Release")).join()
        assertEquals(listOf("Breathe in", "Hold", "Release"), asked)
        assertArrayEquals("Hold".toByteArray(), audio.audio("Hold"))
        assertEquals(3, asked.size)
    }

    @Test fun breathworkLinesCoverTheOpeningEveryPhaseAndTheClose() {
        val pattern = BreathworkPattern(name = "Box Breathing", inhale = 4.0, holdActive = 4.0, exhale = 8.0, cycles = 4)
        assertEquals(
            listOf(
                Guidance.beginBreathwork("Box Breathing"),
                "Breathe in", "Hold", "Exhale fully, letting the day go",
                Guidance.breathworkComplete("Box Breathing"),
            ),
            Guidance.breathLines(pattern),
        )
    }

    @Test fun theLineAfterAPoseIsTheNextPoseOrTheClose() {
        val poses = listOf("Mountain", "Warrior II").map { YogaPose(nameEnglish = it, instructions = "Stand tall.") }
        assertEquals(Guidance.enterPose(poses[1]), Guidance.nextLine(0, poses))
        assertEquals(Guidance.RITUAL_COMPLETE, Guidance.nextLine(1, poses))
    }
}
