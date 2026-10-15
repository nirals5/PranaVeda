package com.pranaveda.app

import com.pranaveda.app.net.SseParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SseParserTest {
    private fun bytes(s: String) = s.toByteArray(Charsets.UTF_8)

    @Test fun readsEventsSeparatedByBlankLines() {
        val parser = SseParser()
        val events = parser.feed(bytes("data: {\"type\":\"text\",\"delta\":\"Hi\"}\n\ndata: {\"type\":\"done\"}\n\n"))
        assertEquals(listOf("{\"type\":\"text\",\"delta\":\"Hi\"}", "{\"type\":\"done\"}"), events)
    }

    @Test fun keepsAnEventSplitAcrossChunks() {
        val parser = SseParser()
        assertTrue(parser.feed(bytes("data: {\"type\":\"te")).isEmpty())
        assertTrue(parser.feed(bytes("xt\",\"delta\":\"Hello\"}\n")).isEmpty())
        assertEquals(listOf("{\"type\":\"text\",\"delta\":\"Hello\"}"), parser.feed(bytes("\n")))
    }

    @Test fun handlesCarriageReturnsCommentsAndOtherFields() {
        val parser = SseParser()
        assertEquals(listOf("one"), parser.feed(bytes(": keep-alive\r\nevent: message\r\ndata: one\r\n\r\n")))
    }

    @Test fun joinsMultipleDataLinesOfOneEvent() {
        val parser = SseParser()
        assertEquals(listOf("line one\nline two"), parser.feed(bytes("data: line one\ndata: line two\n\n")))
    }

    @Test fun returnsAnEventLeftWithoutItsBlankLineWhenTheStreamEnds() {
        val parser = SseParser()
        assertTrue(parser.feed(bytes("data: last")).isEmpty())
        assertEquals("last", parser.finish())
        assertNull(parser.finish())
    }

    @Test fun keepsMultibyteCharactersIntactAcrossChunks() {
        val parser = SseParser()
        val events = mutableListOf<String>()
        for (byte in bytes("data: Prāṇa 🌙\n\n")) events += parser.feed(byteArrayOf(byte))
        assertEquals(listOf("Prāṇa 🌙"), events)
    }

    @Test fun readsOnlyTheGivenRangeOfABuffer() {
        val parser = SseParser()
        val buffer = bytes("xxdata: a\n\nyy")
        assertEquals(listOf("a"), parser.feed(buffer, 2, buffer.size - 4))
    }
}
