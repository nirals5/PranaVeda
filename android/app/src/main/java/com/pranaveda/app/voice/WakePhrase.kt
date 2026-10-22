package com.pranaveda.app.voice

/** What "Hey Amrita …" asks for, read from the words the phone heard. Same rules as the iPhone app. */
object WakePhrase {
    /** Spoken practice controls: "Hey Amrita, pause". */
    enum class Command { Pause, Resume, Next, Back, End }

    /** A wake phrase was heard, with the command said straight after it, if any. */
    data class Match(val command: Command?)

    /** The last "Hey Amrita" in [text] and the command after it, or null when the wake phrase isn't there. */
    fun match(text: String): Match? {
        val words = words(text)
        var after: Int? = null
        var i = 0
        while (i < words.size) {
            val length = if (words[i] in greetings) nameLength(words, i + 1) else null
            if (length != null) {
                after = i + 1 + length
                i += 1 + length
            } else {
                i++
            }
        }
        return after?.let { Match(command(words.drop(it))) }
    }

    /** A command said on its own ("pause", "go back"), once Amrita is listening. */
    fun command(text: String): Command? = command(words(text))

    /**
     * The first word that isn't a filler ("please", "go to the …") must be the
     * command, so "Hey Amrita, my back hurts" isn't heard as "back".
     */
    private fun command(words: List<String>): Command? = words.firstOrNull { it !in fillers }?.let { commands[it] }

    fun words(text: String): List<String> =
        text.lowercase().replace("'", "").replace("’", "").split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }

    /** How the phone's recognizer tends to write "Hey". */
    private val greetings = setOf("hey", "hay", "hi", "ok", "okay", "hello")
    /** "Amrita", and how it is sometimes heard. */
    private val names = setOf("amrita", "amreeta", "amritha", "amrida", "amritta", "imrita", "umrita", "emrita", "rita")
    /** "Am Rita", "I'm Rita": the name heard as two words. */
    private val nameStarts = setOf("am", "um", "im", "an", "and")
    private val nameEnds = setOf("rita", "reeta", "rida")
    private val fillers = setOf("please", "go", "to", "the", "now", "um", "uh", "and", "can", "you", "a")
    private val commands = mapOf(
        // Not "hold": the breathwork guide says it. "Paws" is how a lone "pause" is often heard.
        "pause" to Command.Pause, "paws" to Command.Pause, "pauses" to Command.Pause, "paused" to Command.Pause,
        "stop" to Command.Pause, "wait" to Command.Pause,
        "resume" to Command.Resume, "continue" to Command.Resume, "play" to Command.Resume, "start" to Command.Resume,
        "begin" to Command.Resume, "unpause" to Command.Resume,
        "next" to Command.Next, "skip" to Command.Next, "forward" to Command.Next,
        "back" to Command.Back, "previous" to Command.Back,
        "end" to Command.End, "finish" to Command.End, "quit" to Command.End, "close" to Command.End, "exit" to Command.End,
    )

    private fun nameLength(words: List<String>, i: Int): Int? = when {
        i >= words.size -> null
        words[i] in names -> 1
        words[i] in nameStarts && i + 1 < words.size && words[i + 1] in nameEnds -> 2
        else -> null
    }
}
