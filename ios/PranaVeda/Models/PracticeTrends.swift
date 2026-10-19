import Foundation

/// Practice trends from the practice log, for Recovery & Trends: real data
/// only (no sample figures), the same on every device because the log syncs.
struct PracticeTrends: Equatable, Sendable {
    struct Week: Equatable, Sendable, Identifiable {
        /// The week's first day (the reader's first weekday).
        let start: Date
        var rituals = 0
        var breathwork = 0
        var ritualMinutes = 0
        var breathworkMinutes = 0

        var id: Date { start }
        var practices: Int { rituals + breathwork }
        var minutes: Int { ritualMinutes + breathworkMinutes }
    }

    /// Oldest first; the last is this week.
    let weeks: [Week]
    let currentStreak: Int
    let longestStreak: Int
    /// Over the weeks shown.
    let ritualShare: Double?

    static let weeksShown = 8

    var thisWeek: Week { weeks[weeks.count - 1] }
    var lastWeek: Week { weeks[weeks.count - 2] }
    var isEmpty: Bool { weeks.allSatisfy { $0.practices == 0 } && longestStreak == 0 }

    init(entries: [PracticeLogEntry], today: Date = Date(), calendar: Calendar = .autoupdatingCurrent) {
        let thisWeekStart = calendar.dateInterval(of: .weekOfYear, for: today)?.start ?? calendar.startOfDay(for: today)
        var weeks = (0..<Self.weeksShown).reversed().map { back in
            Week(start: calendar.date(byAdding: .weekOfYear, value: -back, to: thisWeekStart)!)
        }
        let grid = PracticeCalendar(calendar: calendar)
        for entry in entries {
            guard let day = grid.date(entry.localDate),
                  let index = weeks.lastIndex(where: { $0.start <= day }),
                  day < calendar.date(byAdding: .weekOfYear, value: 1, to: weeks[index].start)! else { continue }
            switch entry.kind {
            case .ritual:
                weeks[index].rituals += 1
                weeks[index].ritualMinutes += entry.durationMinutes
            case .breathwork:
                weeks[index].breathwork += 1
                weeks[index].breathworkMinutes += entry.durationMinutes
            }
        }
        self.weeks = weeks
        currentStreak = PracticeLog.streak(entries, today: today, timeZone: calendar.timeZone)
        longestStreak = Self.longestStreak(Set(entries.map(\.localDate)), calendar: calendar)
        let rituals = weeks.reduce(0) { $0 + $1.rituals }
        let total = weeks.reduce(0) { $0 + $1.practices }
        ritualShare = total == 0 ? nil : Double(rituals) / Double(total)
    }

    /// The longest run of consecutive practice days ever logged.
    static func longestStreak(_ days: Set<String>, calendar: Calendar) -> Int {
        let grid = PracticeCalendar(calendar: calendar)
        let dates = days.compactMap(grid.date).sorted()
        var longest = 0, run = 0
        var previous: Date?
        for date in dates {
            if let previous, calendar.dateComponents([.day], from: previous, to: date).day == 1 { run += 1 } else { run = 1 }
            longest = max(longest, run)
            previous = date
        }
        return longest
    }

    /// "4 practices · 38 min"
    static func weekLine(_ week: Week) -> String {
        let practices = week.practices == 1 ? "1 practice" : "\(week.practices) practices"
        return "\(practices) · \(week.minutes) min"
    }

    /// "Last week: 1 practice · 6 min". Plain, not a score: a quiet week is
    /// never told off (PRODUCT.md's gentle tone).
    static func lastWeekLine(_ week: Week) -> String {
        week.practices == 0 ? "Last week: no practice" : "Last week: \(weekLine(week))"
    }
}
