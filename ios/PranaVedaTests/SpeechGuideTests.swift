import Foundation
import Testing
@testable import PranaVeda

/// What the guide asked the server to say, in order.
private actor Asked {
    private(set) var texts: [String] = []
    func add(_ text: String) { texts.append(text) }
}

private struct Offline: Error {}

@MainActor
struct SpeechGuideTests {
    private func defaults(muted: Bool = false) -> UserDefaults {
        let defaults = UserDefaults(suiteName: "SpeechGuideTests-\(UUID().uuidString)")!
        defaults.set(muted, forKey: "pranaveda_guidance_muted")
        return defaults
    }

    @Test func asksForEachLineOnceAndKeepsIt() async {
        let asked = Asked()
        let guide = SpeechGuide(defaults: defaults()) { text in await asked.add(text); return Data(text.utf8) }
        #expect(await guide.audio(for: "Breathe in") == Data("Breathe in".utf8))
        #expect(await guide.audio(for: "Breathe in") == Data("Breathe in".utf8))
        #expect(await asked.texts == ["Breathe in"])
    }

    @Test func withNoVoiceConfiguredTheRestIsTheBuiltInVoice() async {
        let asked = Asked()
        let guide = SpeechGuide(defaults: defaults()) { text in await asked.add(text); return nil }
        #expect(await guide.audio(for: "Breathe in") == nil)
        #expect(await guide.audio(for: "Exhale slowly") == nil)
        #expect(await asked.texts == ["Breathe in"])
        #expect(guide.builtInOnly)
    }

    @Test func oneFailureIsForgivenTwoAreNot() async {
        let asked = Asked()
        let guide = SpeechGuide(defaults: defaults()) { text in await asked.add(text); throw Offline() }
        #expect(await guide.audio(for: "one") == nil)
        #expect(!guide.builtInOnly)
        #expect(await guide.audio(for: "two") == nil)
        #expect(guide.builtInOnly)
        #expect(await guide.audio(for: "three") == nil)
        #expect(await asked.texts == ["one", "two"])
    }

    @Test func fetchesAheadInOrderWithoutRepeats() async {
        let asked = Asked()
        let guide = SpeechGuide(defaults: defaults()) { text in await asked.add(text); return Data(text.utf8) }
        await guide.prefetch(["Breathe in", "Hold", "Breathe in", "", "Release"]).value
        #expect(await asked.texts == ["Breathe in", "Hold", "Release"])
        // Already here: said without asking again.
        #expect(await guide.audio(for: "Hold") == Data("Hold".utf8))
        #expect(await asked.texts.count == 3)
    }

    @Test func mutedFetchesNothingAhead() async {
        let asked = Asked()
        let guide = SpeechGuide(defaults: defaults(muted: true)) { text in await asked.add(text); return Data() }
        await guide.prefetch(["Breathe in"]).value
        #expect(await asked.texts.isEmpty)
    }

    @Test func breathworkLinesCoverTheOpeningEveryPhaseAndTheClose() {
        let pattern = BreathworkPattern(name: "Box Breathing", sanskritName: nil, description: nil,
                                        inhale: 4, holdActive: 4, exhale: 8, holdEmpty: 0, cycles: 4, benefits: nil)
        #expect(Guidance.breathLines(pattern) == [
            Guidance.beginBreathwork("Box Breathing"),
            "Breathe in", "Hold", "Exhale fully, letting the day go",
            Guidance.breathworkComplete("Box Breathing"),
        ])
    }

    @Test func theLineAfterAPoseIsTheNextPoseOrTheClose() {
        let poses = ["Mountain", "Warrior II"].map {
            YogaPose(poseId: nil, nameEnglish: $0, nameSanskrit: nil, duration: nil, benefits: nil,
                     instructions: "Stand tall.", poseImageUrl: nil, sceneImageUrl: nil, videoUrl: nil)
        }
        #expect(Guidance.nextLine(after: 0, in: poses) == Guidance.enterPose(poses[1]))
        #expect(Guidance.nextLine(after: 1, in: poses) == Guidance.ritualComplete)
    }
}
