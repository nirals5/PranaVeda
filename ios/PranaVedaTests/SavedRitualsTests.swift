import Foundation
import Testing
@testable import PranaVeda

private func ritual(_ title: String) -> RecommendationResult {
    RecommendationResult(
        summary: "For \(title)", doshaTendency: nil, primaryEnergy: "Scattered Wind",
        yogaPractice: YogaPractice(title: title, description: nil, poses: [], durationMinutes: 10),
        ayurvedicAdvice: nil, breathwork: nil, lifestyleTips: nil
    )
}

@MainActor
struct SavedRitualsTests {
    private func freshStore() -> (SavedRitualStore, URL) {
        let file = FileManager.default.temporaryDirectory.appending(path: "saved-\(UUID().uuidString).json")
        return (SavedRitualStore(fileURL: file), file)
    }

    @Test func savesNewestFirstAndKeepsThemAcrossLaunches() {
        let (store, file) = freshStore()
        let now = PracticeLog.isoFormatter.date(from: "2026-10-17T18:00:00.000Z")!
        #expect(store.toggle(ritual("Morning"), now: now))
        #expect(store.toggle(ritual("Evening"), now: now.addingTimeInterval(60)))
        #expect(store.rituals.map(\.title) == ["Evening", "Morning"])
        #expect(store.rituals.first?.id.hasPrefix("save_\(Int(now.timeIntervalSince1970 * 1000) + 60_000)_") == true)
        #expect(store.isSaved(ritual("Morning")))
        #expect(!store.isSaved(ritual("Midday")))
        #expect(SavedRitualStore(fileURL: file).rituals.map(\.title) == ["Evening", "Morning"])
    }

    @Test func savingTheSameRitualAgainRemovesIt() {
        let (store, _) = freshStore()
        store.toggle(ritual("Morning"))
        #expect(!store.toggle(ritual("Morning")))
        #expect(store.rituals.isEmpty)
    }

    @Test func removesOne() {
        let (store, file) = freshStore()
        store.toggle(ritual("Morning"))
        store.toggle(ritual("Evening"))
        store.remove(store.rituals[0])
        #expect(store.rituals.map(\.title) == ["Morning"])
        #expect(SavedRitualStore(fileURL: file).rituals.map(\.title) == ["Morning"])
    }

    @Test func readsTheWebsitesShape() throws {
        let json = #"[{"id":"temp_1","title":"Grounding","date":"Oct 12","query":"I feel scattered","category":"Yoga","result":{"summary":"s","yogaPractice":{"title":"Grounding","poses":[]}}}]"#
        let saved = try JSONDecoder().decode([SavedRitual].self, from: Data(json.utf8))
        #expect(saved.first?.query == "I feel scattered")
        #expect(SavedRitualStore.savedDate(PracticeLog.isoFormatter.date(from: "2026-10-17T18:00:00.000Z")!, locale: Locale(identifier: "en_US")) == "Oct 17")
    }
}
