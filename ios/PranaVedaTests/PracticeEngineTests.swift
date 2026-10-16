import Foundation
import Testing
@testable import PranaVeda

struct PracticeEngineTests {
    @Test func readsPoseDurationsAsTheWebsiteDoes() {
        #expect(poseSeconds("2 minutes") == 120)
        #expect(poseSeconds("1 minute") == 60)
        #expect(poseSeconds("5 breaths") == 30)
        #expect(poseSeconds("30 seconds") == 30)
        #expect(poseSeconds("Hold for 3 minutes") == 180)
        #expect(poseSeconds("as long as feels good") == 120)
        #expect(poseSeconds(nil) == 120)
        #expect(clockString(65) == "1:05")
        #expect(clockString(0) == "0:00")
    }

    @Test func movesThroughPosesAndFinishes() {
        var sequence = PoseSequence(durations: [60, 30])
        #expect(sequence.advance(by: 59.5).isEmpty)
        #expect(sequence.secondsLeft == 1)
        #expect(sequence.advance(by: 0.5) == [.enteredPose(1)])
        #expect(sequence.secondsLeft == 30)
        #expect(sequence.advance(by: 30) == [.finished])
        #expect(sequence.isFinished)
        #expect(sequence.advance(by: 10).isEmpty)
    }

    @Test func catchesUpAfterALongGapWithoutSkippingTheEnd() {
        // Back from the background after 100 s: both poses are over.
        var sequence = PoseSequence(durations: [60, 30])
        #expect(sequence.advance(by: 100) == [.enteredPose(1), .finished])
    }

    @Test func skipsForwardAndBack() {
        var sequence = PoseSequence(durations: [60, 30, 45])
        _ = sequence.advance(by: 20)
        #expect(sequence.previous().isEmpty) // already at the first pose
        #expect(sequence.next() == [.enteredPose(1)])
        #expect(sequence.secondsLeft == 30)
        #expect(sequence.previous() == [.enteredPose(0)])
        #expect(sequence.secondsLeft == 60) // the pose starts over
        _ = sequence.next()
        _ = sequence.next()
        #expect(sequence.next() == [.finished])
    }

    @Test func pacesBreathworkSkippingEmptyHolds() {
        let pattern = BreathworkPattern(name: "Ocean Breath", sanskritName: nil, description: nil,
                                        inhale: 4, holdActive: 0, exhale: 6, holdEmpty: 0, cycles: 2, benefits: nil)
        var pacer = BreathPacer(pattern)
        #expect(pacer.startEvent == .phase(.inhale, seconds: 4, cycle: 1))
        #expect(pacer.advance(by: 4) == [.phase(.exhale, seconds: 6, cycle: 1)])
        #expect(pacer.advance(by: 6) == [.phase(.inhale, seconds: 4, cycle: 2)])
        #expect(pacer.advance(by: 9) == [.phase(.exhale, seconds: 6, cycle: 2)])
        #expect(pacer.secondsLeft == 1)
        #expect(pacer.advance(by: 1) == [.finished])
        #expect(pacer.totalMinutes == 1)
    }

    @Test func pacesAllFourPhasesAndTimesTheWholePractice() {
        let box = BreathworkPattern(name: "Box", sanskritName: "Sama Vritti", description: nil,
                                    inhale: 4, holdActive: 4, exhale: 4, holdEmpty: 4, cycles: 6, benefits: nil)
        var pacer = BreathPacer(box)
        #expect(pacer.advance(by: 12) == [
            .phase(.holdFull, seconds: 4, cycle: 1), .phase(.exhale, seconds: 4, cycle: 1), .phase(.holdEmpty, seconds: 4, cycle: 1),
        ])
        #expect(pacer.totalMinutes == 2) // 16 s × 6 = 96 s, rounded as the website does
    }

    @Test func speaksTheWebsitesWords() {
        let warrior = YogaPose(poseId: "warrior_2", nameEnglish: "Warrior II", nameSanskrit: "Virabhadrasana II", duration: "2 minutes",
                               benefits: nil, instructions: "Step wide. Bend the front knee.", poseImageUrl: nil, sceneImageUrl: nil, videoUrl: nil)
        #expect(Guidance.startPose(warrior)
                == #"Starting posture: Warrior Two, or Virabhadrasana Two. <break time="1.2s" /> Step wide. <break time="1.4s" /> Bend the front knee."#)
        #expect(Guidance.enterPose(warrior).hasPrefix("Entering posture: Warrior Two."))
        #expect(Guidance.returnToPose(warrior).hasPrefix("Returning to posture: Warrior Two."))
        #expect(Guidance.speakableName("Warrior III") == "Warrior Three")
        #expect(Guidance.speakableName("Inversion Index") == "Inversion Index")
        #expect(Guidance.cue(for: .inhale, seconds: 4) == "Breathe in")
        #expect(Guidance.cue(for: .exhale, seconds: 6) == "Exhale slowly")
        #expect(Guidance.cue(for: .holdEmpty, seconds: 8) == "Rest in the quiet emptiness")
    }

    @Test func turnsPauseMarkersIntoSilences() {
        let parts = Guidance.script(#"Beautiful. <break time="0.8s" /> You've completed it. <break time="0.8s" /> Rest here."#)
        #expect(parts.map(\.words) == ["Beautiful.", "You've completed it.", "Rest here."])
        #expect(parts.map(\.pauseAfter) == [0.8, 0.8, 0])
        let plain = Guidance.script("Breathe in")
        #expect(plain.map(\.words) == ["Breathe in"])
        let trailing = Guidance.script(#"Hold. <break time="1.4s" /> <break time="1.2s" />"#)
        #expect(trailing.map(\.words) == ["Hold."])
        #expect(trailing.count == 1)
        #expect(abs((trailing.first?.pauseAfter ?? 0) - 2.6) < 0.0001)
    }
}
