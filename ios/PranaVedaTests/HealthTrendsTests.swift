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

    // MARK: What Amrita is told

    /// Fourteen days ending Oct 16 (Pacific), with sleep, resting heart rate and HRV as given.
    private func days(sleep: [String: Int] = [:], resting: [String: Double] = [:], hrv: [String: Double] = [:]) -> [HealthDay] {
        HealthTrends.combine(today: at("2026-10-16T20:00:00.000Z"), sleep: sleep, restingHeartRate: resting, hrv: hrv, calendar: calendar)
    }
    private var today: Date { at("2026-10-16T20:00:00.000Z") }

    @Test func summarisesEachReadingBesideTheirUsualAsTheWebsiteDoes() {
        let summary = HealthTrends.summary(days(
            sleep: ["2026-10-13": 420, "2026-10-14": 450, "2026-10-15": 435, "2026-10-16": 310],
            resting: ["2026-10-12": 60, "2026-10-13": 61, "2026-10-14": 59, "2026-10-15": 66.4],
            hrv: ["2026-10-10": 50, "2026-10-12": 46, "2026-10-14": 48, "2026-10-16": 38.6]
        ), today: today, calendar: calendar)
        #expect(summary?.sleep == .init(lastNightMinutes: 310, usualMinutes: 435))
        #expect(summary?.restingHeartRate == .init(latest: 66, usual: 60))
        #expect(summary?.hrv == .init(latest: 39, usual: 48, metric: "sdnn"))
    }

    @Test func leavesOutAReadingThatIsStaleOrHasTooFewDays() {
        // Three days only; and four days, but the latest from two days ago.
        let summary = HealthTrends.summary(days(
            sleep: ["2026-10-14": 420, "2026-10-15": 450, "2026-10-16": 300],
            resting: ["2026-10-11": 60, "2026-10-12": 61, "2026-10-13": 59, "2026-10-14": 70]
        ), today: today, calendar: calendar)
        #expect(summary == nil)
        let yesterday = HealthTrends.summary(days(resting: ["2026-10-12": 60, "2026-10-13": 61, "2026-10-14": 59, "2026-10-15": 70]),
                                             today: today, calendar: calendar)
        #expect(yesterday?.restingHeartRate == .init(latest: 70, usual: 60))
    }

    @Test func sendsTheSummaryInTheShapeTheServerReads() throws {
        let summary = HealthSummary(hrv: .init(latest: 39, usual: 48, metric: "sdnn"), sleep: .init(lastNightMinutes: 310, usualMinutes: 435))
        let request = APIClient.ChatRequest(messages: [], profile: .object([:]), localTime: "x", localDate: "2026-10-16", previousSession: nil, health: summary)
        let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        let health = try #require(json["health"] as? [String: Any])
        #expect((health["sleep"] as? [String: Int]) == ["lastNightMinutes": 310, "usualMinutes": 435])
        #expect((health["hrv"] as? [String: Any])?["metric"] as? String == "sdnn")
        #expect(health["restingHeartRate"] == nil)
        let none = APIClient.ChatRequest(messages: [], profile: .object([:]), localTime: "x", localDate: "2026-10-16", previousSession: nil)
        let plain = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(none)) as? [String: Any])
        #expect(plain["health"] == nil)
    }

    @MainActor @Test func sharesNothingUntilTheyTurnItOn() {
        let defaults = UserDefaults(suiteName: "HealthTrendsTests.share")!
        defaults.removePersistentDomain(forName: "HealthTrendsTests.share")
        let store = HealthStore(defaults: defaults)
        #expect(store.sharesWithAmrita == false)
        #expect(store.summaryForAmrita() == nil)
        store.sharesWithAmrita = true
        #expect(HealthStore(defaults: defaults).sharesWithAmrita == true)
    }

    @Test func writesSleepAsHoursAndMinutes() {
        #expect(HealthTrends.hours(450) == "7h 30m")
        #expect(HealthTrends.hours(65) == "1h 05m")
    }
}
