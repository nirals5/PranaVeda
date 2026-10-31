import Foundation
import HealthKit
import Observation

/// What the watch and the phone tell each other (the iPhone app has the same).
struct WatchMessage: Codable {
    var bpm: Int? = nil
    var end: Bool? = nil
    var discard: Bool? = nil
}

/// The workout that runs while a practice is guided on the iPhone: heart rate
/// every few seconds, sent to the phone as it comes. Started by the iPhone
/// (PranaVeda's WatchHeart); ended by it, or by End here. A finished practice
/// is saved to Apple Health as a Mind and Body workout; a closed one isn't.
@MainActor
@Observable
final class WorkoutManager: NSObject {
    static let shared = WorkoutManager()

    private(set) var running = false
    private(set) var bpm: Int?
    private(set) var startedAt: Date?

    @ObservationIgnored private let store = HKHealthStore()
    @ObservationIgnored private var session: HKWorkoutSession?
    @ObservationIgnored private var builder: HKLiveWorkoutBuilder?
    /// Whether ending saves the workout (a finished practice) or throws it away.
    @ObservationIgnored private var saving = true

    func requestAuthorization() async {
        try? await store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [HKQuantityType(.heartRate)])
    }

    /// The iPhone opened the app for a practice.
    func start(_ configuration: HKWorkoutConfiguration) async {
        guard session == nil else { return }
        await requestAuthorization()
        do {
            let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder
            saving = true
            let now = Date()
            session.startActivity(with: now)
            try await builder.beginCollection(at: now)
            try await session.startMirroringToCompanionDevice()
            startedAt = now
            running = true
        } catch {
            reset()
        }
    }

    /// End here, or from the phone: saved unless the practice was closed.
    func end(saving: Bool = true) {
        self.saving = saving
        session?.end()
    }

    private func finished() async {
        guard let builder else { return reset() }
        do {
            try await builder.endCollection(at: Date())
            if saving { _ = try await builder.finishWorkout() } else { builder.discardWorkout() }
        } catch {}
        reset()
    }

    private func reset() {
        session = nil
        builder = nil
        running = false
        bpm = nil
        startedAt = nil
    }

    private func send(_ bpm: Int) {
        self.bpm = bpm
        guard let session, let data = try? JSONEncoder().encode(WatchMessage(bpm: bpm)) else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }

    private func heard(_ message: WatchMessage) {
        if message.discard == true { end(saving: false) } else if message.end == true { end(saving: true) }
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        Task { @MainActor in await self.finished() }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in self.end(saving: false) }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
        let messages = data.compactMap { try? JSONDecoder().decode(WatchMessage.self, from: $0) }
        Task { @MainActor in messages.forEach(self.heard) }
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let heartRate = HKQuantityType(.heartRate)
        guard collectedTypes.contains(heartRate),
              let value = workoutBuilder.statistics(for: heartRate)?.mostRecentQuantity()?.doubleValue(for: .count().unitDivided(by: .minute()))
        else { return }
        let bpm = Int(value.rounded())
        Task { @MainActor in self.send(bpm) }
    }
}
