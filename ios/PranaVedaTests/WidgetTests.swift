import Foundation
import Testing
@testable import PranaVeda

struct WidgetTests {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        calendar.firstWeekday = 1
        return calendar
    }
    private func at(_ iso: String) -> Date { PracticeLog.isoFormatter.date(from: iso)! }
    private func entry(_ id: String, _ localDate: String, _ kind: PracticeLogEntry.Kind = .ritual) -> PracticeLogEntry {
        PracticeLogEntry(id: id, kind: kind, title: id, completedAt: "\(localDate)T18:00:00.000Z", localDate: localDate, durationMinutes: 10, result: nil)
    }

    @Test func countsTheStreakForTheMomentItIsShown() {
        var snapshot = WidgetSnapshot()
        for day in ["2026-10-14", "2026-10-15", "2026-10-16"] { snapshot.days[day] = .init(ritual: true) }
        let friday = at("2026-10-16T20:00:00.000Z")
        #expect(snapshot.streak(today: friday, calendar: calendar) == 3)
        // Saturday with nothing yet: still alive through yesterday.
        let saturday = at("2026-10-17T20:00:00.000Z")
        #expect(snapshot.streak(today: saturday, calendar: calendar) == 3)
        #expect(snapshot.practised(on: saturday, calendar: calendar) == nil)
        // Sunday: a day was missed.
        #expect(snapshot.streak(today: at("2026-10-18T20:00:00.000Z"), calendar: calendar) == 0)
    }

    @Test func laysOutTheWeekFromTheFirstWeekday() {
        var snapshot = WidgetSnapshot()
        snapshot.days["2026-10-12"] = .init(breathwork: true)
        snapshot.days["2026-10-16"] = .init(ritual: true)
        let week = snapshot.week(of: at("2026-10-16T20:00:00.000Z"), calendar: calendar)
        #expect(week.count == 7)
        #expect(WidgetSnapshot.key(week[0].date, calendar) == "2026-10-11") // Sunday
        #expect(week.compactMap(\.day).count == 2)
        #expect(week[1].day?.breathwork == true)
        #expect(week[5].day?.ritual == true)
    }

    @Test func showsTheReflectionOnlyOnItsOwnDay() {
        var snapshot = WidgetSnapshot()
        snapshot.insight = .init(headline: "H", tip: "T", focus: "F", localDate: "2026-10-16")
        #expect(snapshot.insight(for: at("2026-10-16T20:00:00.000Z"), calendar: calendar)?.headline == "H")
        #expect(snapshot.insight(for: at("2026-10-17T20:00:00.000Z"), calendar: calendar) == nil)
    }

    @Test func buildsTheSnapshotFromTheApp() {
        let now = at("2026-10-16T20:00:00.000Z")
        let reflection = DailyInsight(headline: "Rooted", quote: "q", focus: "Grounding", tip: "Warm milk")
        let saved = SavedRitual(id: "save_1_x", title: "Easing the Spine", date: "Oct 16", query: "", category: "Yoga",
                                result: RecommendationResult(summary: nil, doshaTendency: nil, primaryEnergy: nil,
                                                             yogaPractice: YogaPractice(title: "Easing the Spine", description: nil, poses: [], durationMinutes: nil),
                                                             ayurvedicAdvice: nil, breathwork: nil, lifestyleTips: nil))
        let snapshot = WidgetBridge.snapshot(
            entries: [entry("a", "2026-10-16"), entry("b", "2026-10-16", .breathwork), entry("old", "2024-01-01")],
            saved: [saved], insight: .loaded(reflection), now: now, calendar: calendar
        )
        #expect(snapshot.days["2026-10-16"] == .init(ritual: true, breathwork: true))
        #expect(snapshot.days["2024-01-01"] == nil) // older than kept
        #expect(snapshot.newestSaved == .init(id: "save_1_x", title: "Easing the Spine"))
        #expect(snapshot.insight == .init(headline: "Rooted", tip: "Warm milk", focus: "Grounding", localDate: "2026-10-16"))

        // A stand-in reflection is never put on the home screen.
        var standIn = reflection
        standIn.isFallback = true
        #expect(WidgetBridge.snapshot(entries: [], saved: [], insight: .loaded(standIn), now: now, calendar: calendar).insight == nil)
    }

    @Test func savesAndReadsTheSnapshot() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).json")
        var snapshot = WidgetSnapshot()
        snapshot.days["2026-10-16"] = .init(ritual: true)
        snapshot.save(to: file)
        #expect(WidgetSnapshot.load(from: file) == snapshot)
        #expect(WidgetSnapshot.load(from: nil) == .empty)
    }
}
