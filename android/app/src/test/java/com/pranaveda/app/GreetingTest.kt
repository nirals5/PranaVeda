package com.pranaveda.app

import com.pranaveda.app.ui.chat.timeOfDay
import org.junit.Assert.assertEquals
import org.junit.Test

class GreetingTest {
    @Test fun greetsByTheHourAsTheWebsiteDoes() {
        assertEquals(listOf("evening", "evening", "evening"), listOf(0, 1, 4).map(::timeOfDay))
        assertEquals(listOf("morning", "morning"), listOf(5, 11).map(::timeOfDay))
        assertEquals(listOf("afternoon", "afternoon"), listOf(12, 16).map(::timeOfDay))
        assertEquals(listOf("evening", "evening"), listOf(17, 23).map(::timeOfDay))
    }
}
