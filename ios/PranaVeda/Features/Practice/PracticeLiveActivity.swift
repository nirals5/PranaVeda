import ActivityKit
import Foundation

/// Keeps a practice's Live Activity in step with the practice screen: started
/// when the practice begins, updated at each new pose or breath phase and on
/// pause, ended when the practice finishes or closes. If Live Activities are
/// off in Settings, it quietly does nothing.
@MainActor
final class PracticeLiveActivity {
    /// Held by id: Activity isn't Sendable, so the async update and end look it up afresh.
    private var activityID: String?

    func show(title: String, kind: String, step: String, detail: String, secondsLeft: Int, running: Bool, now: Date = Date()) {
        let state = Self.state(step: step, detail: detail, secondsLeft: secondsLeft, running: running, now: now)
        if let activityID {
            Task { await Self.find(activityID)?.update(ActivityContent(state: state, staleDate: nil)) }
        } else if ActivityAuthorizationInfo().areActivitiesEnabled {
            activityID = try? Activity.request(
                attributes: PracticeActivityAttributes(title: title, kind: kind),
                content: ActivityContent(state: state, staleDate: nil)
            ).id
        }
    }

    func end() {
        guard let activityID else { return }
        self.activityID = nil
        Task { await Self.find(activityID)?.end(nil, dismissalPolicy: .immediate) }
    }

    private nonisolated static func find(_ id: String) -> Activity<PracticeActivityAttributes>? {
        Activity<PracticeActivityAttributes>.activities.first { $0.id == id }
    }

    nonisolated static func state(step: String, detail: String, secondsLeft: Int, running: Bool, now: Date) -> PracticeActivityAttributes.ContentState {
        .init(step: step, detail: detail,
              endsAt: running ? now.addingTimeInterval(TimeInterval(secondsLeft)) : nil,
              pausedSecondsLeft: running ? nil : secondsLeft)
    }
}
