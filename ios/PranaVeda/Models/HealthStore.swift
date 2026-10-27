import Foundation
import HealthKit
import Observation

/// Heart and sleep readings from Apple Health, read on the phone for
/// Recovery & Trends. They stay on the phone unless the person lets Amrita see
/// them; then a short summary (HealthSummary) goes with each message.
@MainActor
@Observable
final class HealthStore {
    enum State: Equatable {
        /// Apple Health is not on this device (an iPad, say).
        case unavailable
        /// Not connected yet: the card offers to.
        case notConnected
        case loading
        case loaded([HealthDay])
        case failed
    }

    private(set) var state: State
    private let store = HKHealthStore()
    private let defaults: UserDefaults
    private static let connectedKey = "pranaveda_health_connected"
    private static let shareKey = "pranaveda_health_share_with_amrita"

    /// Whether Amrita may see a summary of the readings. Off until they turn it on.
    var sharesWithAmrita: Bool {
        didSet { defaults.set(sharesWithAmrita, forKey: Self.shareKey) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        state = !HKHealthStore.isHealthDataAvailable() ? .unavailable : defaults.bool(forKey: Self.connectedKey) ? .loading : .notConnected
        sharesWithAmrita = defaults.bool(forKey: Self.shareKey)
    }

    /// What goes with a message: nothing unless they let Amrita see it.
    func summaryForAmrita(today: Date = Date()) -> HealthSummary? {
        guard sharesWithAmrita, case .loaded(let days) = state else { return nil }
        return HealthTrends.summary(days, today: today)
    }

    /// Asks once for permission to read sleep, resting heart rate and HRV,
    /// then reads them. Apple Health never says whether reading was refused,
    /// so a refusal simply shows as no readings.
    func connect() async {
        guard state != .unavailable else { return }
        do {
            try await Self.requestRead(from: store)
            defaults.set(true, forKey: Self.connectedKey)
            await load()
        } catch {
            state = .failed
        }
    }

    func load(today: Date = Date()) async {
        guard defaults.bool(forKey: Self.connectedKey), state != .unavailable else { return }
        if case .loaded = state {} else { state = .loading }
        let calendar = Calendar.autoupdatingCurrent
        let from = calendar.date(byAdding: .day, value: -(HealthTrends.daysShown + 1), to: calendar.startOfDay(for: today))!
        async let sleep = Self.sleepIntervals(in: store, from: from, to: today)
        async let resting = Self.dailyAverages(in: store, .restingHeartRate, unit: .count().unitDivided(by: .minute()), from: from, to: today)
        async let hrv = Self.dailyAverages(in: store, .heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), from: from, to: today)
        let days = HealthTrends.combine(today: today, sleep: HealthTrends.sleepMinutes(await sleep, calendar: calendar),
                                        restingHeartRate: await resting, hrv: await hrv, calendar: calendar)
        state = .loaded(days)
    }

    // HealthKit calls back on its own threads, so these stay off the main actor.

    nonisolated private static var readTypes: Set<HKObjectType> {
        [HKCategoryType(.sleepAnalysis), HKQuantityType(.restingHeartRate), HKQuantityType(.heartRateVariabilitySDNN)]
    }

    nonisolated private static func requestRead(from store: HKHealthStore) async throws {
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    /// Stretches of actual sleep (not time in bed), from every source.
    nonisolated private static func sleepIntervals(in store: HKHealthStore, from: Date, to: Date) async -> [DateInterval] {
        let asleep: Set<Int> = [HKCategoryValueSleepAnalysis.asleepUnspecified, .asleepCore, .asleepDeep, .asleepREM].reduce(into: []) { $0.insert($1.rawValue) }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to)
        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: HKCategoryType(.sleepAnalysis), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                let intervals = (samples as? [HKCategorySample] ?? [])
                    .filter { asleep.contains($0.value) && $0.endDate > $0.startDate }
                    .map { DateInterval(start: $0.startDate, end: $0.endDate) }
                continuation.resume(returning: intervals)
            }
            store.execute(query)
        }
    }

    /// The average of a reading for each day, by "YYYY-MM-DD".
    nonisolated private static func dailyAverages(in store: HKHealthStore, _ identifier: HKQuantityTypeIdentifier, unit: HKUnit,
                                                  from: Date, to: Date) async -> [String: Double] {
        let calendar = Calendar.autoupdatingCurrent
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsCollectionQuery(
                quantityType: HKQuantityType(identifier),
                quantitySamplePredicate: HKQuery.predicateForSamples(withStart: from, end: to),
                options: .discreteAverage,
                anchorDate: calendar.startOfDay(for: from),
                intervalComponents: DateComponents(day: 1)
            )
            query.initialResultsHandler = { _, collection, _ in
                var values: [String: Double] = [:]
                collection?.enumerateStatistics(from: from, to: to) { statistics, _ in
                    if let average = statistics.averageQuantity()?.doubleValue(for: unit) {
                        values[WidgetSnapshot.key(statistics.startDate, calendar)] = average
                    }
                }
                continuation.resume(returning: values)
            }
            store.execute(query)
        }
    }
}
