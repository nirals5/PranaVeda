import Foundation
import Testing
@testable import PranaVeda

private func saved(_ id: String, _ title: String, poses: [String] = [], minutes: Int? = 10) -> SavedRitual {
    let poses = poses.map {
        YogaPose(poseId: nil, nameEnglish: $0, nameSanskrit: nil, duration: nil, benefits: nil,
                 instructions: nil, poseImageUrl: nil, sceneImageUrl: nil, videoUrl: nil)
    }
    let result = RecommendationResult(
        summary: "For \(title)", doshaTendency: nil, primaryEnergy: nil,
        yogaPractice: YogaPractice(title: title, description: nil, poses: poses, durationMinutes: minutes),
        ayurvedicAdvice: nil, breathwork: nil, lifestyleTips: nil
    )
    return SavedRitual(id: id, title: title, date: "Nov 4", query: "Conversation with Amrita", category: "Yoga", result: result)
}

struct SiriIntentsTests {
    private let rituals = [
        saved("a", "Evening Wind-Down", poses: ["Child's Pose", "Legs Up the Wall"]),
        saved("b", "Morning Energy Flow", poses: ["Sun Salutation", "Warrior II"]),
        saved("c", "Desk Reset", poses: ["Seated Twist"]),
    ]

    @Test func findsARitualByTitleOrPose() {
        #expect(SavedRitualEntity.matching("my evening ritual", in: rituals).map(\.id) == ["a"])
        #expect(SavedRitualEntity.matching("Warrior", in: rituals).map(\.id) == ["b"])
        #expect(SavedRitualEntity.matching("the twist one", in: rituals).map(\.id) == ["c"])
    }

    @Test func theBetterMatchComesFirst() {
        #expect(SavedRitualEntity.matching("morning energy", in: rituals).first?.id == "b")
        #expect(SavedRitualEntity.matching("evening morning", in: rituals).map(\.id) == ["a", "b"])
    }

    @Test func generalWordsMatchNothing() {
        #expect(SavedRitualEntity.matching("my practice", in: rituals).isEmpty)
        #expect(SavedRitualEntity.matching("yoga flow", in: rituals).isEmpty)
        #expect(SavedRitualEntity.matching("headstand", in: rituals).isEmpty)
    }

    @Test func anEntityCarriesWhatSiriShows() {
        let entity = SavedRitualEntity(rituals[0])
        #expect(entity.id == "a")
        #expect(entity.title == "Evening Wind-Down")
        #expect(entity.minutes == 10)
        #expect(entity.poses == ["Child's Pose", "Legs Up the Wall"])
        #expect(entity.about == "For Evening Wind-Down")
    }

    @Test func readsTheSavedRitualsFile() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "saved-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        #expect(SavedRitualEntity.saved(fileURL: file).isEmpty)
        try JSONEncoder().encode(rituals).write(to: file)
        #expect(SavedRitualEntity.saved(fileURL: file).map(\.id) == ["a", "b", "c"])
    }

    @Test func linksToAParticularRitual() {
        let url = WidgetLink.practice("save_1760000000000_ab12c")
        #expect(url.absoluteString == "pranaveda://practice/save_1760000000000_ab12c")
        #expect(url.host() == "practice" && url.pathComponents.count > 1 && url.lastPathComponent == "save_1760000000000_ab12c")
        #expect(WidgetLink.practice.pathComponents.count <= 1)
    }

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        calendar.firstWeekday = 1
        return calendar
    }
    private let wednesday = PracticeLog.isoFormatter.date(from: "2026-11-04T20:00:00.000Z")!
    private func entry(_ id: String, _ localDate: String, minutes: Int = 10) -> PracticeLogEntry {
        PracticeLogEntry(id: id, kind: .ritual, title: id, completedAt: "\(localDate)T18:00:00.000Z", localDate: localDate, durationMinutes: minutes, result: nil)
    }

    @Test func summarisesTheStreakAndTheWeek() {
        let trends = PracticeTrends(entries: [entry("a", "2026-11-02", minutes: 15), entry("b", "2026-11-03"), entry("c", "2026-11-04")],
                                    today: wednesday, calendar: calendar)
        #expect(PracticeSummaryIntent.summary(trends) == "You're on a 3-day streak. This week: 3 practices, 35 minutes.")
    }

    @Test func summarisesAQuietWeek() {
        let trends = PracticeTrends(entries: [entry("a", "2026-10-20")], today: wednesday, calendar: calendar)
        #expect(PracticeSummaryIntent.summary(trends) == "Your next practice starts a new streak. Nothing logged this week yet.")
        let one = PracticeTrends(entries: [entry("a", "2026-11-04")], today: wednesday, calendar: calendar)
        #expect(PracticeSummaryIntent.summary(one) == "You're on a 1-day streak. This week: 1 practice, 10 minutes.")
    }

    @Test func summarisesAnEmptyLog() {
        let trends = PracticeTrends(entries: [], today: wednesday, calendar: calendar)
        #expect(PracticeSummaryIntent.summary(trends).hasPrefix("You haven't logged a practice yet."))
    }
}
