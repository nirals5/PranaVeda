package com.pranaveda.app

import com.pranaveda.app.voice.VoiceRequest
import com.pranaveda.app.voice.VoiceRequest.Action
import com.pranaveda.app.voice.WakePhrase
import com.pranaveda.app.voice.WakePhrase.Command
import com.pranaveda.app.voice.WakePhrase.Match
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** The same cases as the iPhone app's HeyAmritaTests. */
class HeyAmritaTest {
    @Test fun hearsTheWakePhraseAlone() {
        assertEquals(Match(null), WakePhrase.match("Hey Amrita"))
        assertEquals(Match(null), WakePhrase.match("Hey, Amrita."))
        assertEquals(Match(null), WakePhrase.match("OK Amrita"))
    }

    @Test fun hearsTheNameHowTheRecognizerWritesIt() {
        assertNotNull(WakePhrase.match("Hey Amreeta"))
        assertNotNull(WakePhrase.match("Hey I'm Rita"))
        assertEquals(Match(Command.Pause), WakePhrase.match("hey am rita pause"))
        assertNotNull(WakePhrase.match("Hi Rita"))
    }

    @Test fun needsTheGreeting() {
        assertNull(WakePhrase.match("Amrita"))
        assertNull(WakePhrase.match("I'm Rita"))
        assertNull(WakePhrase.match("hey there"))
        assertNull(WakePhrase.match("Breathe in. Hold. Release."))
    }

    @Test fun readsTheCommandAfterIt() {
        assertEquals(Match(Command.Pause), WakePhrase.match("Hey Amrita, pause"))
        assertEquals(Match(Command.Pause), WakePhrase.match("Hey Amrita stop"))
        assertEquals(Match(Command.Resume), WakePhrase.match("Hey Amrita, resume"))
        assertEquals(Match(Command.Next), WakePhrase.match("Hey Amrita. Next."))
        assertEquals(Match(Command.Back), WakePhrase.match("hey amrita go back"))
        assertEquals(Match(Command.Next), WakePhrase.match("Hey Amrita, go to the next pose please"))
        assertEquals(Match(Command.Pause), WakePhrase.match("Hey Amrita can you pause"))
        assertEquals(Match(Command.End), WakePhrase.match("Hey Amrita, end the practice"))
    }

    @Test fun aQuestionIsNotACommand() {
        assertEquals(Match(null), WakePhrase.match("Hey Amrita, my back hurts"))
        assertEquals(Match(null), WakePhrase.match("Hey Amrita what should I do next"))
    }

    @Test fun theLatestWakePhraseCounts() {
        assertEquals(Match(Command.Next), WakePhrase.match("hey amrita pause and then hey amrita next"))
    }

    @Test fun aCommandOnItsOwnAfterTheChime() {
        assertEquals(Command.Pause, WakePhrase.command("Pause"))
        assertEquals(Command.Back, WakePhrase.command("go back"))
        assertEquals(Command.Next, WakePhrase.command("Skip this one"))
        assertNull(WakePhrase.command("how long is left"))
        assertEquals(Command.Pause, WakePhrase.command("Paws"))
    }

    @Test fun theGuidesOwnCuesAreNotCommands() {
        assertNull(WakePhrase.command("Hold"))
        assertNull(WakePhrase.command("Hold, steady"))
        assertNull(WakePhrase.command("Breathe in"))
    }

    @Test fun aRequestToListenIsActedOnOnceAndNeverLate() {
        val at = 100_000L
        assertEquals(Action.Start, VoiceRequest.action(at, at + 200, replying = false))
        // Said while Amrita is replying: wait for the reply to end.
        assertEquals(Action.Wait, VoiceRequest.action(at, at + 200, replying = true))
        assertEquals(Action.Start, VoiceRequest.action(at, at + 8_000, replying = false))
        // Too old to act on, replying or not: never start the microphone late.
        assertEquals(Action.Drop, VoiceRequest.action(at, at + VoiceRequest.TTL_MILLIS + 1, replying = true))
        assertEquals(Action.Drop, VoiceRequest.action(at, at + VoiceRequest.TTL_MILLIS + 1, replying = false))
    }
}
