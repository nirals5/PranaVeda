package com.pranaveda.app.net

import java.io.ByteArrayOutputStream

/**
 * Splits a server-sent-events byte stream into the `data:` payloads.
 *
 * The chat endpoint frames each event as `data: <json>` followed by a blank
 * line. Bytes arrive in arbitrary chunks, so a line (or a multi-byte
 * character) may be split across chunks; the parser keeps the unfinished part
 * until its end arrives. Each payload is the joined `data:` lines of one
 * event. Comments (lines starting with ":") and other fields are ignored.
 */
class SseParser {
    private val line = ByteArrayOutputStream()
    private val dataLines = mutableListOf<String>()

    /** Feeds more bytes; returns the payloads of every event completed by them. */
    fun feed(bytes: ByteArray, offset: Int = 0, length: Int = bytes.size - offset): List<String> {
        val events = mutableListOf<String>()
        for (i in offset until offset + length) {
            val byte = bytes[i]
            if (byte == NEWLINE) {
                endLine()?.let(events::add)
            } else {
                line.write(byte.toInt())
            }
        }
        return events
    }

    /** Call when the stream ends: returns an event left without its blank line. */
    fun finish(): String? {
        if (line.size() > 0) endLine()?.let { return it }
        return flush()
    }

    private fun endLine(): String? {
        var text = line.toString(Charsets.UTF_8.name())
        line.reset()
        if (text.endsWith("\r")) text = text.dropLast(1)
        if (text.isEmpty()) return flush()
        if (text.startsWith("data:")) {
            var value = text.substring(5)
            if (value.startsWith(" ")) value = value.substring(1)
            dataLines.add(value)
        }
        return null
    }

    private fun flush(): String? {
        if (dataLines.isEmpty()) return null
        return dataLines.joinToString("\n").also { dataLines.clear() }
    }

    private companion object {
        const val NEWLINE = '\n'.code.toByte()
    }
}
