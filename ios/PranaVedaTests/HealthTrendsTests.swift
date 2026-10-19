import Foundation
import Testing
@testable import PranaVeda

struct HealthTrendsTests {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar
    }
    private func at(_ iso: String) -> Date { PracticeLog.isoFormatter.date(from: iso)! }

    @Test func countsANightOnTheMorningYouWakeWithoutCountingOverlapsTwice() {
        // Thursday night 11 pm to Friday 6:30 am (Pacific), logged by a watch;
        // the phone logged 1–5 am of the same night.
        let watch = DateInterval(start: at("2026-10-16T06:00:00.000Z"), end: at("2026-10-16T13:30:00.000Z"))
        let phone = DateInterval(start: at("2026-10-16T08:00:00.000Z"), end: at("2026-10-16T12:00:00.000Z"))
        // A 20-minute nap on Friday afternoon.
        let nap = DateInterval(start: at("2026-10-16T22:00:00.000Z"), end: at("2026-10-16T22:20:00.000Z"))
        let minutes = HealthTrends.sleepMinutes([phone, nap, watch], calendar: calendar)
        #expect(minutes["2026-10-16"] == 450 + 20)
        #expect(minutes["2026-10-15"] == nil)
    }

    @Test func coversTheLastTwoWeeksEndingToday() {
        let today = at("2026-10-16T20:00:00.000Z")
        let days = HealthTrends.combine(today: today, sleep: ["2026-10-16": 420], restingHeartRate: ["2026-10-15": 61.4],
                                        hrv: ["2026-10-03": 48], calendar: calendar)
        #expect(days.count == 14)
        #expect(days.first?.key == "2026-10-03")
        #expect(days.last?.key == "2026-10-16")
        #expect(days.last?.sleepMinutes == 420)
        #expect(days[12].restingHeartRate == 61.4)
        #expect(days.first?.hrv == 48)
        #expect(days[5].isEmpty)
    }

    @Test func writesSleepAsHoursAndMinutes() {
        #expect(HealthTrends.hours(450) == "7h 30m")
        #expect(HealthTrends.hours(65) == "1h 05m")
    }
}
