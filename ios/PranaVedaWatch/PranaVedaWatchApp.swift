import HealthKit
import SwiftUI
import WatchKit

/// PranaVeda on Apple Watch: heart rate during a practice guided on the
/// iPhone. The phone opens it; it shows the reading, the time and End.
@main
struct PranaVedaWatchApp: App {
    @WKApplicationDelegateAdaptor private var delegate: WatchDelegate

    var body: some Scene {
        WindowGroup { PracticeHeartView(workout: .shared) }
    }
}

final class WatchDelegate: NSObject, WKApplicationDelegate {
    /// The iPhone's startWatchApp(toHandle:) lands here.
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in await WorkoutManager.shared.start(workoutConfiguration) }
    }
}

struct PracticeHeartView: View {
    let workout: WorkoutManager
    private let lavender = Color(red: 0.54, green: 0.47, blue: 0.65)

    var body: some View {
        if workout.running {
            VStack(spacing: 6) {
                Image(systemName: "heart.fill").font(.title3).foregroundStyle(.pink)
                Text(workout.bpm.map { "\($0)" } ?? "--")
                    .font(.system(size: 44, weight: .light, design: .rounded).monospacedDigit())
                    .accessibilityLabel(workout.bpm.map { "\($0) beats per minute" } ?? "Waiting for a reading")
                Text("bpm").font(.footnote).foregroundStyle(.secondary)
                if let started = workout.startedAt {
                    Text(started, style: .timer).font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
                }
                Button("End") { workout.end() }
                    .tint(lavender)
                    .accessibilityHint("Ends the heart reading; the practice on your iPhone goes on")
            }
        } else {
            VStack(spacing: 8) {
                Image(systemName: "figure.mind.and.body").font(.title2).foregroundStyle(lavender)
                Text("Start a guided practice on your iPhone, and your heart rate shows here.")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
            }
            .task { await workout.requestAuthorization() }
        }
    }
}
