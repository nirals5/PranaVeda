package com.pranaveda.app

import com.pranaveda.app.practice.PracticeNotice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PracticeNoticeTest {
    private val now = 1_800_000_000_000L

    @Test fun runningCountsDownToAnEndTime() {
        val content = PracticeNotice.content("Box Breathing", "Inhale", "Cycle 2 of 6", 4, running = true, nowMillis = now)
        assertEquals("Inhale", content.title)
        assertEquals("Box Breathing · Cycle 2 of 6", content.text)
        assertEquals(now + 4_000, content.endsAtMillis)
        assertNull(content.pausedChip)
    }

    @Test fun pausedShowsTheTimeLeft() {
        val content = PracticeNotice.content("Unwind the Seated Spine", "Tree Pose", "Posture 3 of 5", 65, running = false, nowMillis = now)
        assertEquals("Paused · 1:05 left · Posture 3 of 5", content.text)
        assertNull(content.endsAtMillis)
        assertEquals("1:05", content.pausedChip)
    }
}
