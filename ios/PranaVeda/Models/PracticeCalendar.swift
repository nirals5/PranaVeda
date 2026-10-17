import Foundation

/// The month grid behind the practice calendar, following the website's
/// (src/components/PracticeCalendar.tsx): days are the log's "YYYY-MM-DD"
/// keys, so a practice sits on the day it was done wherever it was done.
struct PracticeCalendar: Sendable {
    var calendar: Calendar

    init(calendar: Calendar = .autoupdatingCurrent) {
        self.calendar = calendar
    }

    /// The first day of the month that `date` falls in.
    func monthStart(_ date: Date) -> Date {
        calendar.date(from: calendar.dateComponents([.year, .month], from: date))!
    }

    func adding(months: Int, to month: Date) -> Date {
        calendar.date(byAdding: .month, value: months, to: monthStart(month))!
    }

    /// The month's days as log keys, the 1st first.
    func dayKeys(_ month: Date) -> [String] {
        let start = monthStart(month)
        let count = calendar.range(of: .day, in: .month, for: start)!.count
        return (0..<count).map { key(calendar.date(byAdding: .day, value: $0, to: start)!) }
    }

    /// Empty cells before the 1st, so it sits under its weekday. Weeks start
    /// on the reader's own first weekday (Sunday in the US, as on the website).
    func leadingBlanks(_ month: Date) -> Int {
        let weekday = calendar.component(.weekday, from: monthStart(month))
        return (weekday - calendar.firstWeekday + 7) % 7
    }

    /// Weekday initials and full names in display order.
    var weekdays: [(short: String, long: String)] {
        let shorts = calendar.veryShortWeekdaySymbols
        let longs = calendar.weekdaySymbols
        return (0..<7).map { offset in
            let index = (calendar.firstWeekday - 1 + offset) % 7
            return (shorts[index], longs[index])
        }
    }

    func key(_ date: Date) -> String {
        ChatViewModel.localDate(date, in: calendar.timeZone)
    }

    func date(_ key: String) -> Date? {
        let parser = DateFormatter()
        parser.calendar = calendar
        parser.timeZone = calendar.timeZone
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        return parser.date(from: key)
    }

    /// Each day's practices, in the order they were done.
    static func byDay(_ entries: [PracticeLogEntry]) -> [String: [PracticeLogEntry]] {
        Dictionary(grouping: entries, by: \.localDate)
    }

    /// "4 practices this month · 3-day streak"
    static func monthLine(count: Int, streak: Int) -> String {
        let practices = count == 1 ? "1 practice this month" : "\(count) practices this month"
        return streak > 0 ? "\(practices) · \(streak)-day streak" : practices
    }

    /// What a reader hears for a day: "Friday, October 16, today, 2 practices".
    func dayDescription(_ key: String, practices: Int, today: String) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = calendar.locale ?? .current
        formatter.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        let name = date(key).map(formatter.string(from:)) ?? key
        let count = practices == 0 ? "no practice" : practices == 1 ? "1 practice" : "\(practices) practices"
        return key == today ? "\(name), today, \(count)" : "\(name), \(count)"
    }

    /// What the selected day's panel says when nothing was practiced.
    static func emptyDayLine(_ key: String, today: String) -> String {
        if key > today { return "This day has not arrived yet." }
        if key == today { return "Nothing practiced yet today. Finishing a ritual or a breathwork session marks the day." }
        return "No practice was recorded on this day."
    }
}
