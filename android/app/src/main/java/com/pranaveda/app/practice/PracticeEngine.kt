package com.pranaveda.app.practice

import com.pranaveda.app.model.BreathworkPattern
import com.pranaveda.app.model.YogaPose
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

// The timing and the words of a guided practice, kept apart from the screens
// so they can be tested. They follow the website's player
// (src/components/CoachingDashboard.tsx) and the iOS app.

/**
 * How long a pose is held, from its duration text: "2 minutes" → 120 s,
 * "5 breaths" → 30 s (6 s a breath), "30 seconds" → 30 s; 2 minutes when
 * there is no number.
 */
fun poseSeconds(duration: String?): Int {
    if (duration == null) return 120
    val number = Regex("""\d+""").find(duration)?.value?.toIntOrNull()?.takeIf { it > 0 } ?: return 120
    val lower = duration.lowercase()
    return when {
        "breath" in lower -> number * 6
        "sec" in lower -> number
        else -> number * 60
    }
}

/** "1:05" */
fun clockString(seconds: Int): String {
    val s = max(seconds, 0)
    return String.format(java.util.Locale.ROOT, "%d:%02d", s / 60, s % 60)
}

/** Moves through a ritual's poses, each held for its own time. */
class PoseSequence(durations: List<Int>) {
    sealed interface Event {
        data class EnteredPose(val index: Int) : Event
        data object Finished : Event
    }

    val durations: List<Int> = durations.ifEmpty { listOf(120) }
    var index = 0
        private set

    /** Seconds left in the current pose. */
    var remaining: Double = this.durations[0].toDouble()
        private set
    var isFinished = false
        private set

    val secondsLeft: Int get() = ceil(remaining).toInt()

    /** Time passes; returns what happened, in order. */
    fun advance(seconds: Double): List<Event> {
        if (isFinished) return emptyList()
        val events = mutableListOf<Event>()
        var left = seconds
        while (left > 0 && !isFinished) {
            if (left < remaining) {
                remaining -= left
                left = 0.0
            } else {
                left -= remaining
                events += goNext()
            }
        }
        return events
    }

    fun next(): List<Event> = if (isFinished) emptyList() else goNext()

    fun previous(): List<Event> {
        if (isFinished || index == 0) return emptyList()
        index--
        remaining = durations[index].toDouble()
        return listOf(Event.EnteredPose(index))
    }

    private fun goNext(): List<Event> {
        if (index + 1 < durations.size) {
            index++
            remaining = durations[index].toDouble()
            return listOf(Event.EnteredPose(index))
        }
        isFinished = true
        remaining = 0.0
        return listOf(Event.Finished)
    }
}

/** Paces breathwork: inhale, hold, exhale, rest, for the pattern's cycles. Holds of zero seconds are skipped. */
class BreathPacer(pattern: BreathworkPattern) {
    enum class Phase { Inhale, HoldFull, Exhale, HoldEmpty }

    sealed interface Event {
        data class PhaseStarted(val phase: Phase, val seconds: Int, val cycle: Int) : Event
        data object Finished : Event
    }

    val steps: List<Pair<Phase, Int>> = listOf(
        Phase.Inhale to pattern.inhale,
        Phase.HoldFull to pattern.holdActive,
        Phase.Exhale to pattern.exhale,
        Phase.HoldEmpty to pattern.holdEmpty,
    ).filter { it.second > 0 }.map { it.first to max(1, it.second.roundToInt()) }
        .ifEmpty { listOf(Phase.Inhale to 4, Phase.Exhale to 4) }
    val cycles: Int = max(1, pattern.cycles)

    var step = 0
        private set
    var cycle = 1
        private set
    var remaining: Double = steps[0].second.toDouble()
        private set
    var isFinished = false
        private set

    val phase: Phase get() = steps[step].first
    val phaseSeconds: Int get() = steps[step].second
    val secondsLeft: Int get() = ceil(remaining).toInt()

    /** Whole minutes the practice takes, at least one (as the website logs it). */
    val totalMinutes: Int get() = max(1, (steps.sumOf { it.second } * cycles / 60.0).roundToInt())

    /** The event that starts the practice. */
    val startEvent: Event get() = Event.PhaseStarted(phase, phaseSeconds, cycle)

    fun advance(seconds: Double): List<Event> {
        if (isFinished) return emptyList()
        val events = mutableListOf<Event>()
        var left = seconds
        while (left > 0 && !isFinished) {
            if (left < remaining) {
                remaining -= left
                left = 0.0
            } else {
                left -= remaining
                when {
                    step + 1 < steps.size -> step++
                    cycle < cycles -> {
                        step = 0
                        cycle++
                    }
                    else -> {
                        isFinished = true
                        remaining = 0.0
                        events += Event.Finished
                        break
                    }
                }
                remaining = steps[step].second.toDouble()
                events += Event.PhaseStarted(phase, phaseSeconds, cycle)
            }
        }
        return events
    }
}

/**
 * What the guide says, word for word as on the website. A pause marker
 * `<break time="1.2s" />` (ElevenLabs markup there) becomes a silence here.
 */
object Guidance {
    /** "Warrior II" → "Warrior Two" */
    fun speakableName(name: String): String =
        name.replace(Regex("""\bIII\b"""), "Three").replace(Regex("""\bII\b"""), "Two").replace(Regex("""\bI\b"""), "One")

    /** A 1.4 s pause after each sentence, so there is time to move into position. */
    fun paced(text: String): String = text.replace(Regex("""\.\s+"""), """. <break time="1.4s" /> """)

    /** The caution note (G13), said before the instructions. */
    fun takeCare(caution: String?): String = caution?.let { """Take care. $it <break time="0.8s" /> """ } ?: ""

    fun startPose(pose: YogaPose): String {
        val also = pose.nameSanskrit?.let { ", or ${speakableName(it)}" } ?: ""
        return """Starting posture: ${speakableName(pose.nameEnglish)}$also. <break time="1.2s" /> ${takeCare(pose.caution)}${paced(pose.instructions ?: "")}"""
    }

    fun enterPose(pose: YogaPose): String =
        """Entering posture: ${speakableName(pose.nameEnglish)}. <break time="1.2s" /> ${takeCare(pose.caution)}${paced(pose.instructions ?: "")}"""

    fun returnToPose(pose: YogaPose): String =
        """Returning to posture: ${speakableName(pose.nameEnglish)}. <break time="1.2s" /> ${takeCare(pose.caution)}${paced(pose.instructions ?: "")}"""

    const val RITUAL_COMPLETE = "Yoga ritual completed. Sit quietly and feel the light of integration."

    fun beginBreathwork(name: String, caution: String? = null) =
        "Beginning the nourishing practice of $name" + (caution?.let { """. <break time="0.8s" /> Take care. $it""" } ?: "")

    fun breathworkComplete(name: String) =
        """Beautiful. <break time="0.8s" /> You've completed your $name. <break time="0.8s" /> Rest here, and let your breath return to its natural rhythm."""

    /** Breath cues must fit the breath: longer phases get longer words. */
    fun cue(phase: BreathPacer.Phase, seconds: Int): String {
        val variants = when (phase) {
            BreathPacer.Phase.Inhale -> listOf("Breathe in", "Inhale slowly", "Inhale slowly, drawing in calm")
            BreathPacer.Phase.HoldFull -> listOf("Hold", "Hold, steady", "Hold the breath, soft and steady")
            BreathPacer.Phase.Exhale -> listOf("Release", "Exhale slowly", "Exhale fully, letting the day go")
            BreathPacer.Phase.HoldEmpty -> listOf("Rest", "Rest, empty", "Rest in the quiet emptiness")
        }
        return if (seconds >= 7) variants[2] else if (seconds >= 5) variants[1] else variants[0]
    }

    data class Part(val words: String, val pauseAfter: Double)

    /** Splits text at its pause markers: the words to say, each followed by a pause in seconds. */
    fun script(text: String): List<Part> {
        val raw = mutableListOf<Part>()
        var start = 0
        for (match in Regex("""<break\s+time="([\d.]+)s"\s*/>""").findAll(text)) {
            raw += Part(text.substring(start, match.range.first), match.groupValues[1].toDoubleOrNull() ?: 0.0)
            start = match.range.last + 1
        }
        raw += Part(text.substring(start), 0.0)
        val parts = mutableListOf<Part>()
        for (part in raw.map { it.copy(words = it.words.trim()) }) {
            if (part.words.isEmpty()) {
                if (parts.isNotEmpty()) parts[parts.lastIndex] = parts.last().copy(pauseAfter = parts.last().pauseAfter + part.pauseAfter)
            } else {
                parts += part
            }
        }
        return parts
    }
}
