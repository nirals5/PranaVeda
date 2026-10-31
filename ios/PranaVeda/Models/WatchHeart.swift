import Foundation
import HealthKit
import Observation
import WatchConnectivity

/// Live heart rate from an Apple Watch during a guided practice. The iPhone
/// asks the watch to start PranaVeda's watch app, which runs a Mind and Body
/// workout (the only way a watch app gets readings every few seconds) and
/// mirrors it here; each reading arrives as a small message. Ending the
/// practice ends the workout, which the watch saves to Apple Health. Off
/// until turned on under Heart & sleep, and only offered with the watch app.
@MainActor
@Observable
final class WatchHeart: NSObject {
    static let shared = WatchHeart()

    private(set) var enabled: Bool
    /// A paired watch with PranaVeda on it.
    private(set) var watchReady = false
    /// The latest reading during a practice.
    private(set) var bpm: Int?
    /// Apple Health access for workouts and heart rate wasn't given.
    private(set) var blocked = false

    private let defaults: UserDefaults
    @ObservationIgnored private let store = HKHealthStore()
    @ObservationIgnored private var session: HKWorkoutSession?
    @ObservationIgnored private var readings: [Int] = []
    /// A practice is under way and wants readings.
    @ObservationIgnored private var practicing = false

    private static let enabledKey = "pranaveda_watch_heart"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        enabled = defaults.bool(forKey: Self.enabledKey)
    }

    /// At launch: the mirrored workout can arrive at any time after the
    /// watch app starts, so the handler is set up front.
    func activate() {
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        store.workoutSessionMirroringStartHandler = { [weak self] session in
            Task { @MainActor in self?.attach(session) }
        }
    }

    /// From the switch: asks Apple Health for workouts (saved by the watch)
    /// and heart rate the first time.
    func setEnabled(_ on: Bool) async {
        if on {
            do {
                try await store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [HKQuantityType(.heartRate)])
                blocked = store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingDenied
            } catch {
                blocked = true
            }
            guard !blocked else { return }
        }
        enabled = on
        defaults.set(on, forKey: Self.enabledKey)
    }

    // MARK: A practice

    /// A guided practice started: open the watch app and begin reading.
    func begin() {
        guard enabled, watchReady, HKHealthStore.isHealthDataAvailable() else { return }
        readings = []
        bpm = nil
        practicing = true
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .mindAndBody
        configuration.locationType = .indoor
        Task {
            do {
                try await store.startWatchApp(toHandle: configuration)
            } catch {
                practicing = false
            }
        }
    }

    /// The practice finished: the watch saves the workout, and the readings
    /// become the practice's heart summary (nil with too few).
    func finish() -> HeartSummary? {
        guard practicing else { return nil }
        let summary = HeartSummary.summarize(readings)
        close(saving: true)
        return summary
    }

    /// Closed before the end: nothing is saved anywhere.
    func cancel() {
        guard practicing else { return }
        close(saving: false)
    }

    private func close(saving: Bool) {
        practicing = false
        bpm = nil
        readings = []
        guard let session else { return }
        let message = try? JSONEncoder().encode(WatchMessage(end: saving ? true : nil, discard: saving ? nil : true))
        Task {
            if let message { try? await session.sendToRemoteWorkoutSession(data: message) }
        }
        self.session = nil
    }

    private func attach(_ mirrored: HKWorkoutSession) {
        session = mirrored
        mirrored.delegate = self
        // The practice was closed while the watch was still starting.
        if !practicing { cancel(session: mirrored) }
    }

    private func cancel(session: HKWorkoutSession) {
        guard let message = try? JSONEncoder().encode(WatchMessage(end: nil, discard: true)) else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: message) }
        self.session = nil
    }

    private func received(_ bpm: Int) {
        guard practicing, (25...240).contains(bpm) else { return }
        readings.append(bpm)
        self.bpm = bpm
    }

    private func refreshReady() {
        let session = WCSession.default
        watchReady = session.activationState == .activated && session.isPaired && session.isWatchAppInstalled
    }
}

/// What the watch and the phone tell each other (the watch app has the same).
struct WatchMessage: Codable {
    var bpm: Int? = nil
    var end: Bool? = nil
    var discard: Bool? = nil
}

extension WatchHeart: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
        let readings = data.compactMap { try? JSONDecoder().decode(WatchMessage.self, from: $0).bpm }
        Task { @MainActor in readings.forEach(self.received) }
    }
}

extension WatchHeart: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.refreshReady() }
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in self.refreshReady() }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}
