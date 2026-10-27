import Foundation

/// One day of heart and sleep readings from the phone's health store, for
/// Recovery & Trends. Read on the phone; only a short summary is ever sent,
/// and only when they let Amrita see it (HealthSummary).
struct HealthDay: Equatable, Sendable, Identifiable {
    /// "YYYY-MM-DD", the day the readings belong to (sleep: the morning you woke).
    let key: String
    let date: Date
    var sleepMinutes: Int?
    var restingHeartRate: Double?
    /// Heart-rate variability in milliseconds. Apple Health measures it as
    /// SDNN (Health Connect as RMSSD); the two are not interchangeable, so the
    /// chart names which it shows.
    var hrv: Double?

    var id: String { key }
    var isEmpty: Bool { sleepMinutes == nil && restingHeartRate == nil && hrv == nil }
}

enum HealthTrends {
    static let daysShown = 14

    /// The last `daysShown` days, oldest first, ending today.
    static func days(endingOn today: Date, calendar: Calendar = .autoupdatingCurrent) -> [(key: String, date: Date)] {
        let start = calendar.startOfDay(for: today)
        return (0..<daysShown).reversed().map { back in
            let date = calendar.date(byAdding: .day, value: -back, to: start)!
            return (WidgetSnapshot.key(date, calendar), date)
        }
    }

    /// Minutes asleep per morning. Overlapping records (a watch and the phone
    /// both logging the same night) are merged first so time is not counted
    /// twice; each stretch belongs to the day it ends on.
    static func sleepMinutes(_ intervals: [DateInterval], calendar: Calendar = .autoupdatingCurrent) -> [String: Int] {
        var merged: [DateInterval] = []
        for interval in intervals.sorted(by: { $0.start < $1.start }) {
            if let last = merged.last, interval.start <= last.end {
                merged[merged.count - 1] = DateInterval(start: last.start, end: max(last.end, interval.end))
            } else {
                merged.append(interval)
            }
        }
        var minutes: [String: Int] = [:]
        for interval in merged {
            minutes[WidgetSnapshot.key(interval.end, calendar), default: 0] += Int((interval.duration / 60).rounded())
        }
        return minutes
    }

    /// The readings for each of the last 14 days, from per-day values.
    static func combine(today: Date, sleep: [String: Int], restingHeartRate: [String: Double], hrv: [String: Double],
                        calendar: Calendar = .autoupdatingCurrent) -> [HealthDay] {
        days(endingOn: today, calendar: calendar).map { day in
            HealthDay(key: day.key, date: day.date, sleepMinutes: sleep[day.key],
                      restingHeartRate: restingHeartRate[day.key], hrv: hrv[day.key])
        }
    }

    /// "7h 20m"
    static func hours(_ minutes: Int) -> String { "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m" }

    /// What Amrita is told, as the website tells her: each reading's latest
    /// value beside their usual. The latest must be from today or yesterday,
    /// with at least four days of that reading; "usual" is the average of the
    /// days before it. Nil when there is nothing to tell.
    static func summary(_ days: [HealthDay], today: Date, calendar: Calendar = .autoupdatingCurrent) -> HealthSummary? {
        let todayKey = WidgetSnapshot.key(today, calendar)
        let yesterdayKey = WidgetSnapshot.key(calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: today))!, calendar)
        func latestVsUsual(_ value: (HealthDay) -> Double?) -> (latest: Int, usual: Int)? {
            let recent = Array(days.filter { value($0) != nil && $0.key <= todayKey }.suffix(daysShown))
            guard recent.count >= 4, let latest = recent.last, latest.key >= yesterdayKey else { return nil }
            let earlier = recent.dropLast().compactMap(value)
            return (Int(value(latest)!.rounded()), Int((earlier.reduce(0, +) / Double(earlier.count)).rounded()))
        }
        var summary = HealthSummary()
        if let r = latestVsUsual(\.restingHeartRate) { summary.restingHeartRate = .init(latest: r.latest, usual: r.usual) }
        if let h = latestVsUsual(\.hrv) { summary.hrv = .init(latest: h.latest, usual: h.usual, metric: "sdnn") }
        if let s = latestVsUsual({ $0.sleepMinutes.map(Double.init) }) { summary.sleep = .init(lastNightMinutes: s.latest, usualMinutes: s.usual) }
        return summary.isEmpty ? nil : summary
    }
}

/// The readings sent with a message when they let Amrita see them, in the
/// shape the website sends (the server's HealthContext). Apple Health's HRV
/// is SDNN, and says so.
struct HealthSummary: Encodable, Equatable, Sendable {
    struct Reading: Encodable, Equatable, Sendable {
        let latest: Int
        let usual: Int
        var metric: String?
    }
    struct Sleep: Encodable, Equatable, Sendable {
        let lastNightMinutes: Int
        let usualMinutes: Int
    }
    var restingHeartRate: Reading?
    var hrv: Reading?
    var sleep: Sleep?

    var isEmpty: Bool { restingHeartRate == nil && hrv == nil && sleep == nil }
}
