import Foundation
import Testing
@testable import PranaVeda

/// The suggestions under the welcome: the website's (src/App.tsx), with where
/// they are first when location is on.
struct SuggestionTests {
    @Test func whereTheyAreComesFirstInTheWebsitesWords() {
        let list = Suggestions.list(place: .saved(.work), knowsConstitution: false)
        #expect(list == [
            "I'm at work. Something quiet I can do at my desk, please.",
            "I haven't been sleeping well lately",
            "I feel stressed and overwhelmed",
            "Help me discover my dosha profile",
        ])
        #expect(Suggestions.forPlace(.saved(.home)) == "I'm at home with room to use the floor. What would you suggest?")
        #expect(Suggestions.forPlace(.elsewhere) == "I'm out and about. Something I can do anywhere, no mat needed.")
    }

    @Test func nothingAboutPlaceWithoutLocationAndAMorningPracticeOnceTheirConstitutionIsKnown() {
        #expect(Suggestions.list(place: nil, knowsConstitution: true) == [
            "I haven't been sleeping well lately",
            "I feel stressed and overwhelmed",
            "Help me create a morning yoga practice",
        ])
    }

    @MainActor @Test func followsThePlaceStore() {
        let store = PlaceStore(defaults: UserDefaults(suiteName: "SuggestionTests-\(UUID().uuidString)")!)
        #expect(Suggestions.list(place: store.current, knowsConstitution: false).count == 3)
        store.enable()
        store.setPosition(PlacePosition(lat: 37.7749, lon: -122.4194, accuracy: 10))
        store.save(.home)
        #expect(Suggestions.list(place: store.current, knowsConstitution: false).first?.hasPrefix("I'm at home") == true)
    }
}
