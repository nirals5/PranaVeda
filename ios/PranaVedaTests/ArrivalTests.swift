import Foundation
import Testing
@testable import PranaVeda

/// Arrival reminders, paced like the free-time reminders.
struct ArrivalTests {
    let tz = TimeZone(identifier: "America/Los_Angeles")!
    var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = tz
        return c
    }
    /// Oct 30 2026 at h:m, Pacific.
    func at(_ h: Int, _ m: Int = 0, day: Int = 30) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: h, minute: m))!
    }
    func remind(_ kind: PlaceKind = .home, at time: Date, practice: Date? = nil, last: Date? = nil, reminded: Date? = nil, busy: Bool = false) -> Bool {
        Arrival.shouldRemind(kind, at: time, lastPracticeAt: practice, lastReminderAt: last, remindedAt: reminded, busyNow: busy, calendar: calendar)
    }

    @Test func remindsOnArrivingHomeInWakingHours() {
        #expect(remind(at: at(18, 5)))
        #expect(remind(.studio, at: at(7)))
        #expect(remind(.outdoors, at: at(21, 59)))
    }

    @Test func neverAtWork() {
        #expect(!remind(.work, at: at(9)))
        #expect(!Arrival.kinds.contains(.work))
    }

    @Test func onlyBetweenSevenAndTen() {
        #expect(!remind(at: at(6, 59)))
        #expect(!remind(at: at(22)))
    }

    @Test func notSoonAfterAPracticeOrAnotherReminder() {
        #expect(!remind(at: at(18), practice: at(16, 30)))
        #expect(remind(at: at(18), practice: at(16)))
        #expect(!remind(at: at(18), last: at(15, 30)))
        #expect(remind(at: at(18), last: at(15)))
    }

    @Test func oncePerPlaceEachDay() {
        #expect(!remind(at: at(20), reminded: at(9)))
        #expect(remind(at: at(9), reminded: at(20, day: 29)))
    }

    @Test func quietDuringACommitment() {
        #expect(!remind(at: at(18), busy: true))
    }

    @Test func eachPlaceHasItsOwnNote() {
        #expect(Arrival.text(.home) == "You're home. A few minutes of slow breathing to settle in?")
        #expect(Set(Arrival.kinds.map(Arrival.text)).count == Arrival.kinds.count)
        #expect(Arrival.stay == 5 * 60)
    }
}
