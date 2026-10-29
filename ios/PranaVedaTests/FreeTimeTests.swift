import Foundation
import Testing
@testable import PranaVeda

/// Free time by the website's rules (src/hooks/useExternalCalendar.ts and
/// useNudgeNotifications.ts), read from the phone's calendar.
struct FreeTimeTests {
    let tz = TimeZone(identifier: "America/Los_Angeles")!
    var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = tz
        return c
    }
    /// Oct 29 2026 at h:m, Pacific.
    func at(_ h: Int, _ m: Int = 0, day: Int = 29) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: h, minute: m))!
    }
    func busy(_ a: Date, _ b: Date) -> BusyInterval { BusyInterval(start: a, end: b) }

    @Test func onlyRealCommitmentsMakeThemBusy() {
        let events = [
            CalendarEvent(start: at(9), end: at(10)),
            CalendarEvent(start: at(9, 30), end: at(11)), // overlaps: merged
            CalendarEvent(start: at(0), end: at(0, day: 30), allDay: true),
            CalendarEvent(start: at(12), end: at(13), showsAsFree: true),
            CalendarEvent(start: at(14), end: at(15), cancelled: true),
            CalendarEvent(start: at(16), end: at(17), declined: true),
            CalendarEvent(start: at(18), end: at(18, 30)),
        ]
        #expect(FreeTime.busy(from: events) == [busy(at(9), at(11)), busy(at(18), at(18, 30))])
    }

    @Test func offersAnOpeningOnlyWhenTheRulesAllow() {
        let day = [busy(at(9), at(10)), busy(at(14), at(15))]
        let slot = FreeTime.openSlot(day, now: at(12, 20), lastPracticeAt: nil, calendar: calendar)
        #expect(slot?.minutes == 100)
        #expect(slot?.until == at(14))
        #expect(FreeTime.describe(slot!, timeZone: tz) == "You have 100 open minutes, until 2:00 PM.")
        #expect(FreeTime.practiceNow(slot!) == "I have about 100 free minutes right now. What would you suggest?")

        #expect(FreeTime.openSlot(day, now: at(9, 30), lastPracticeAt: nil, calendar: calendar) == nil) // in a commitment
        #expect(FreeTime.openSlot(day, now: at(13, 55), lastPracticeAt: nil, calendar: calendar) == nil) // 5 minutes
        #expect(FreeTime.openSlot(day, now: at(6, 30), lastPracticeAt: nil, calendar: calendar) == nil) // before 7
        #expect(FreeTime.openSlot(day, now: at(22, 5), lastPracticeAt: nil, calendar: calendar) == nil) // after 10
        #expect(FreeTime.openSlot(day, now: at(12), lastPracticeAt: at(11), calendar: calendar) == nil) // just practised

        let evening = FreeTime.openSlot(day, now: at(16), lastPracticeAt: nil, calendar: calendar)
        #expect(evening?.minutes == nil)
        #expect(FreeTime.describe(evening!, timeZone: tz) == "Your calendar is open for the rest of today.")
    }

    @Test func tellsAmritaTheShapeOfTheDayOnly() {
        let day = [busy(at(9), at(10)), busy(at(14), at(15)), busy(at(8, 30, day: 30), at(9, day: 30))]
        let free = FreeTime.context(day, now: at(12, 20), calendar: calendar)
        #expect(free == CalendarContext(
            now: "Free for about 100 minutes, until 2:00 PM",
            busyToday: ["2:00 PM–3:00 PM"],
            busyTomorrow: ["8:30 AM–9:00 AM"]
        ))
        #expect(FreeTime.context(day, now: at(14, 30), calendar: calendar).now == "In a commitment until 3:00 PM")
        #expect(FreeTime.context(day, now: at(16), calendar: calendar).now == "Free for the rest of today")
    }

    @Test func plansAtMostOneReminderPerOpeningThreeHoursApart() throws {
        let day = [busy(at(9), at(10)), busy(at(11), at(12)), busy(at(13), at(17)), busy(at(8, day: 30), at(9, day: 30))]
        let plan = FreeTime.planReminders(day, from: at(8, 15), until: at(0, day: 31), lastPracticeAt: nil, last: nil, calendar: calendar)
        #expect(plan.map(\.at) == [
            at(8, 15),          // the opening before 9
            at(12),             // 3h 45m later, after the 11–12
            at(17),             // the evening
            at(7, day: 30),     // tomorrow at 7, before the 8 o'clock
        ])
        #expect(plan.first?.text == "You have 45 open minutes, until 9:00 AM.")

        // One already shown for the evening: not again for that opening.
        try #require(plan.count == 4)
        let later = FreeTime.planReminders(day, from: at(18), until: at(0, day: 30), lastPracticeAt: nil, last: plan[2], calendar: calendar)
        #expect(later.isEmpty)
    }

    @Test func remindersWaitAfterAPracticeAndStayInWakingHours() {
        let plan = FreeTime.planReminders([], from: at(21, 30), until: at(0, day: 31), lastPracticeAt: at(21), last: nil, calendar: calendar)
        #expect(plan.map(\.at) == [at(7, day: 30), at(7, day: 31)].filter { $0 < at(0, day: 31) })
    }

    @Test func timesUseAnOrdinarySpace() {
        #expect(!FreeTime.time(at(21, 35), timeZone: tz).contains("\u{202F}"))
    }

    @MainActor @Test func offUntilTurnedOnAndNothingGoesToAmrita() {
        let store = CalendarStore(defaults: UserDefaults(suiteName: "CalendarTests-\(UUID().uuidString)")!)
        #expect(!store.enabled)
        store.setBusy([busy(at(9), at(10))])
        #expect(store.contextForAmrita == nil)
        #expect(store.openSlot(now: at(12)) == nil)
    }

    @Test func busyTimesGoWithAMessage() throws {
        var request = APIClient.ChatRequest(
            messages: [.init(role: "user", content: "Hello")], profile: .object([:]),
            localTime: "10/29/2026, 12:20:00 PM", localDate: "2026-10-29", previousSession: nil
        )
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        #expect(json["calendar"] == nil)
        request.calendar = CalendarContext(now: "Free for the rest of today", busyToday: [], busyTomorrow: ["8:30 AM–9:00 AM"])
        json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        let sent = try #require(json["calendar"] as? [String: Any])
        #expect(sent["now"] as? String == "Free for the rest of today")
        #expect(sent["busyTomorrow"] as? [String] == ["8:30 AM–9:00 AM"])
    }
}
