import Foundation
import Testing
@testable import PranaVeda

struct PracticeLiveActivityTests {
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func runningCountsDownToAnEndTime() {
        let state = PracticeLiveActivity.state(step: "Inhale", detail: "Cycle 2 of 6", secondsLeft: 4, running: true, now: now)
        #expect(state.endsAt == now.addingTimeInterval(4))
        #expect(state.pausedSecondsLeft == nil)
        #expect(state.step == "Inhale")
        #expect(state.detail == "Cycle 2 of 6")
    }

    @Test func pausedHoldsTheTimeLeft() {
        let state = PracticeLiveActivity.state(step: "Tree Pose", detail: "Posture 3 of 5", secondsLeft: 42, running: false, now: now)
        #expect(state.endsAt == nil)
        #expect(state.pausedSecondsLeft == 42)
    }

    @Test func stateSurvivesTheTripToTheLockScreen() throws {
        let state = PracticeLiveActivity.state(step: "Exhale", detail: "Cycle 1 of 4", secondsLeft: 6, running: true, now: now)
        let decoded = try JSONDecoder().decode(PracticeActivityAttributes.ContentState.self, from: JSONEncoder().encode(state))
        #expect(decoded == state)
    }
}
