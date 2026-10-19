import Foundation
import Testing
@testable import PranaVeda

struct PracticeTrendsTests {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        calendar.locale = Locale(identifier: "en_US")
        calendar.firstWeekday = 1
        return calendar
    }
    private let friday = PracticeLog.isoFormatter.date(from: "2026-10-16T20:00:00.000Z")!
    private func entry(_ id: String, _ localDate: String, _ kind: PracticeLogEntry.Kind = .ritual, minutes: Int = 10) -> PracticeLogEntry {
        PracticeLogEntry(id: id, kind: kind, title: id, completedAt: "\(localDate)T18:00:00.000Z", localDate: localDate, durationMinutes: minutes, result: nil)
    }

    @Test func addsUpEachOfTheLastEightWeeks() {
        let trends = PracticeTrends(entries: [
            entry("a", "2026-10-16", minutes: 12), entry("b", "2026-10-11", .breathwork, minutes: 3), // this week (from Sun 11)
            entry("c", "2026-10-10", minutes: 20), // last week
            entry("d", "2026-08-22"), // 8 weeks back: the oldest week shown starts Sun 23 Aug, so not shown
        ], today: friday, calendar: calendar)
        #expect(trends.weeks.count == 8)
        #expect(PracticeCalendar(calendar: calendar).key(trends.weeks.first!.start) == "2026-08-23")
        #expect(trends.thisWeek.rituals == 1 && trends.thisWeek.breathwork == 1)
        #expect(trends.thisWeek.minutes == 15)
        #expect(trends.lastWeek.minutes == 20)
        #expect(trends.weeks.reduce(0) { $0 + $1.practices } == 3)
        #expect(trends.ritualShare.map { abs($0 - 2.0 / 3.0) < 0.001 } == true)
    }

    @Test func findsTheLongestStreakEver() {
        let days: Set = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-10", "2026-10-15", "2026-10-16"]
        #expect(PracticeTrends.longestStreak(days, calendar: calendar) == 4)
        #expect(PracticeTrends.longestStreak([], calendar: calendar) == 0)
        let trends = PracticeTrends(entries: days.map { entry($0, $0) }, today: friday, calendar: calendar)
        #expect(trends.currentStreak == 2)
        #expect(trends.longestStreak == 4)
    }

    @Test func describesTheWeek() {
        var this = PracticeTrends.Week(start: friday)
        this.rituals = 3
        this.ritualMinutes = 30
        var last = PracticeTrends.Week(start: friday)
        last.rituals = 1
        #expect(PracticeTrends.weekLine(this) == "3 practices · 30 min")
        #expect(PracticeTrends.lastWeekLine(last) == "Last week: 1 practice · 0 min")
        #expect(PracticeTrends.lastWeekLine(PracticeTrends.Week(start: friday)) == "Last week: no practice")
        #expect(PracticeTrends(entries: [], today: friday, calendar: calendar).isEmpty)
    }
}
