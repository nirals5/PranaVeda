import Foundation
import Testing
@testable import PranaVeda

/// Saved places: the website's rules (src/hooks/usePlace.ts), and what reaches Amrita.
@MainActor
struct PlaceTests {
    let home = SavedPlace(kind: .home, lat: 37.7749, lon: -122.4194)
    let work = SavedPlace(kind: .work, lat: 37.7899, lon: -122.4010)

    func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "PlaceTests-\(UUID().uuidString)")!
    }

    @Test func distanceIsRoughlyRight() {
        // 0.001° of latitude is about 111 m.
        let d = PlaceMatching.distanceMetres((37.0, -122.0), (37.001, -122.0))
        #expect(abs(d - 111.2) < 1)
    }

    @Test func matchesTheNearestSavedPlaceWithin150Metres() {
        let nearHome = PlacePosition(lat: 37.7757, lon: -122.4194, accuracy: 20) // ~90 m away
        #expect(PlaceMatching.match(nearHome, [home, work]) == .saved(.home))
    }

    @Test func aGoodPositionAwayFromEverySavedPlaceIsElsewhere() {
        let park = PlacePosition(lat: 37.7694, lon: -122.4862, accuracy: 30)
        #expect(PlaceMatching.match(park, [home, work]) == .elsewhere)
    }

    @Test func aVaguePositionWidensTheNetButNotPast500Metres() {
        let fourHundredAway = PlacePosition(lat: 37.7785, lon: -122.4194, accuracy: 450)
        #expect(PlaceMatching.match(fourHundredAway, [home]) == .saved(.home))
        let sixHundredAway = PlacePosition(lat: 37.7803, lon: -122.4194, accuracy: 1500)
        #expect(PlaceMatching.match(sixHundredAway, [home]) == .elsewhere)
    }

    @Test func roughPositionsAndNoSavedPlacesSayNothing() {
        let approximate = PlacePosition(lat: 37.7749, lon: -122.4194, accuracy: 3000)
        #expect(PlaceMatching.match(approximate, [home]) == nil)
        #expect(PlaceMatching.match(PlacePosition(lat: 37.7749, lon: -122.4194, accuracy: 10), []) == nil)
        #expect(PlaceMatching.match(nil, [home]) == nil)
    }

    @Test func offByDefaultAndNothingGoesToAmrita() {
        let store = PlaceStore(defaults: freshDefaults())
        #expect(!store.enabled)
        store.setPosition(PlacePosition(lat: home.lat, lon: home.lon, accuracy: 10))
        #expect(store.contextForAmrita == nil)
    }

    @Test func savingMovesTheOneSpotPerKindAndIsRemembered() {
        let defaults = freshDefaults()
        let store = PlaceStore(defaults: defaults)
        store.enable()
        store.setPosition(PlacePosition(lat: home.lat, lon: home.lon, accuracy: 10))
        store.save(.home)
        #expect(store.contextForAmrita == LocationContext(place: "home"))

        store.setPosition(PlacePosition(lat: work.lat, lon: work.lon, accuracy: 10))
        #expect(store.contextForAmrita == LocationContext(place: "elsewhere"))
        store.save(.home)
        #expect(store.places == [SavedPlace(kind: .home, lat: work.lat, lon: work.lon)])

        let again = PlaceStore(defaults: defaults)
        #expect(again.enabled)
        #expect(again.places == store.places)

        store.remove(.home)
        #expect(store.places.isEmpty)
        store.disable()
        #expect(PlaceStore(defaults: defaults).enabled == false)
    }

    @Test func aRoughPositionCannotBeSaved() {
        let store = PlaceStore(defaults: freshDefaults())
        store.enable()
        store.setPosition(PlacePosition(lat: home.lat, lon: home.lon, accuracy: 5000))
        #expect(store.imprecise)
        store.save(.home)
        #expect(store.places.isEmpty)
    }

    @Test func onlyTheKindOfPlaceIsSentWithAMessage() throws {
        var request = APIClient.ChatRequest(
            messages: [.init(role: "user", content: "Hello")],
            profile: .object([:]),
            localTime: "10/27/2026, 9:00:00 AM",
            localDate: "2026-10-27",
            previousSession: nil
        )
        var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        #expect(json["location"] == nil)

        request.location = LocationContext(place: "work")
        json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        #expect(json["location"] as? [String: String] == ["place": "work"])
    }
}
