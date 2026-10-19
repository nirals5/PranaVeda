import Foundation

/// One day of heart and sleep readings from the phone's health store, for
/// Recovery & Trends. Read on the phone and never sent anywhere.
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
}
