import Testing
@testable import PranaVeda

struct HeyAmritaTests {
    @Test func hearsTheWakePhraseAlone() {
        #expect(WakePhrase.match("Hey Amrita") == .init(command: nil))
        #expect(WakePhrase.match("Hey, Amrita.") == .init(command: nil))
        #expect(WakePhrase.match("OK Amrita") == .init(command: nil))
    }

    @Test func hearsTheNameHowTheRecognizerWritesIt() {
        #expect(WakePhrase.match("Hey Amreeta") != nil)
        #expect(WakePhrase.match("Hey I'm Rita") != nil)
        #expect(WakePhrase.match("hey am rita pause") == .init(command: .pause))
        #expect(WakePhrase.match("Hi Rita") != nil)
    }

    @Test func needsTheGreeting() {
        #expect(WakePhrase.match("Amrita") == nil)
        #expect(WakePhrase.match("I'm Rita") == nil)
        #expect(WakePhrase.match("hey there") == nil)
        #expect(WakePhrase.match("Breathe in. Hold. Release.") == nil)
    }

    @Test func readsTheCommandAfterIt() {
        #expect(WakePhrase.match("Hey Amrita, pause") == .init(command: .pause))
        #expect(WakePhrase.match("Hey Amrita stop") == .init(command: .pause))
        #expect(WakePhrase.match("Hey Amrita, resume") == .init(command: .resume))
        #expect(WakePhrase.match("Hey Amrita. Next.") == .init(command: .next))
        #expect(WakePhrase.match("hey amrita go back") == .init(command: .back))
        #expect(WakePhrase.match("Hey Amrita, go to the next pose please") == .init(command: .next))
        #expect(WakePhrase.match("Hey Amrita can you pause") == .init(command: .pause))
        #expect(WakePhrase.match("Hey Amrita, end the practice") == .init(command: .end))
    }

    @Test func aQuestionIsNotACommand() {
        #expect(WakePhrase.match("Hey Amrita, my back hurts") == .init(command: nil))
        #expect(WakePhrase.match("Hey Amrita what should I do next") == .init(command: nil))
    }

    @Test func theLatestWakePhraseCounts() {
        #expect(WakePhrase.match("hey amrita pause and then hey amrita next") == .init(command: .next))
    }

    @Test func aCommandOnItsOwnAfterTheChime() {
        #expect(WakePhrase.command(in: "Pause") == .pause)
        #expect(WakePhrase.command(in: "go back") == .back)
        #expect(WakePhrase.command(in: "Skip this one") == .next)
        #expect(WakePhrase.command(in: "how long is left") == nil)
        #expect(WakePhrase.command(in: "Paws") == .pause)
    }

    @Test func theGuidesOwnCuesAreNotCommands() {
        #expect(WakePhrase.command(in: "Hold") == nil)
        #expect(WakePhrase.command(in: "Hold, steady") == nil)
        #expect(WakePhrase.command(in: "Breathe in") == nil)
    }
}
