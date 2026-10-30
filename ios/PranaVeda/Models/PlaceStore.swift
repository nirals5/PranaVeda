import CoreLocation
import Foundation
import Observation

/// Where they are, in terms that matter for practice, as on the website
/// (src/hooks/usePlace.ts). While the app is open the phone's position is
/// matched against spots they have saved themselves (home, work, …).
/// Coordinates never leave the phone and no history is kept: Amrita is told
/// only the kind of place.
enum PlaceKind: String, Codable, CaseIterable, Identifiable {
    case home, work, studio, outdoors
    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: "Home"
        case .work: "Work"
        case .studio: "Studio or gym"
        case .outdoors: "Outdoor spot"
        }
    }
}

/// A saved kind of place, or "elsewhere" for a good position that matches none.
enum CurrentPlace: Equatable {
    case saved(PlaceKind)
    case elsewhere

    /// The server's word for it (sanitizeLocationContext).
    var wire: String {
        switch self {
        case .saved(let kind): kind.rawValue
        case .elsewhere: "elsewhere"
        }
    }

    var label: String {
        switch self {
        case .saved(let kind): kind.label
        case .elsewhere: "Somewhere else"
        }
    }
}

struct SavedPlace: Codable, Equatable {
    let kind: PlaceKind
    let lat: Double
    let lon: Double
}

struct PlacePosition: Equatable {
    let lat: Double
    let lon: Double
    /// Metres.
    let accuracy: Double
}

/// What goes with a message: the kind of place only.
struct LocationContext: Encodable, Equatable {
    let place: String
}

enum PlaceMatching {
    static let matchRadiusMetres = 150.0
    /// Beyond this the position is a town-sized guess (approximate location)
    /// and says nothing about which place they are in.
    static let maxUsableAccuracyMetres = 2000.0

    static func distanceMetres(_ a: (lat: Double, lon: Double), _ b: (lat: Double, lon: Double)) -> Double {
        let rad = { (deg: Double) in deg * .pi / 180 }
        let dLat = rad(b.lat - a.lat)
        let dLon = rad(b.lon - a.lon)
        let h = pow(sin(dLat / 2), 2) + cos(rad(a.lat)) * cos(rad(b.lat)) * pow(sin(dLon / 2), 2)
        return 6_371_000 * 2 * asin(sqrt(h))
    }

    /// The nearest saved place within reach; elsewhere when the position is
    /// good but matches none; nil when there is nothing trustworthy to say.
    static func match(_ position: PlacePosition?, _ places: [SavedPlace]) -> CurrentPlace? {
        guard let position, position.accuracy <= maxUsableAccuracyMetres, !places.isEmpty else { return nil }
        // A vague position widens the net a little, but never past a few streets.
        let radius = max(matchRadiusMetres, min(position.accuracy, 500))
        let nearest = places
            .map { (place: $0, distance: distanceMetres((position.lat, position.lon), ($0.lat, $0.lon))) }
            .min { $0.distance < $1.distance }!
        return nearest.distance <= radius ? .saved(nearest.place.kind) : .elsewhere
    }
}

@MainActor
@Observable
final class PlaceStore: NSObject {
    private(set) var enabled: Bool
    private(set) var places: [SavedPlace]
    private(set) var position: PlacePosition?
    /// Location is turned off for PranaVeda in Settings.
    private(set) var blocked = false
    /// They allowed only an approximate location.
    private(set) var approximateOnly = false

    private let defaults: UserDefaults
    @ObservationIgnored private lazy var manager: CLLocationManager = {
        let manager = CLLocationManager()
        manager.delegate = self
        // Plenty for telling one saved place from another.
        // No distance filter: a sharper position in the same spot (after a
        // rough first one) must still come through.
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        return manager
    }()
    /// Watching only while the app is on screen.
    @ObservationIgnored private var active = false
    /// Location was turned on or off, or a place saved, moved or removed.
    @ObservationIgnored var onChange: (() -> Void)?

    static let enabledKey = "pranaveda_location_enabled"
    private nonisolated static let placesKey = "pranaveda_places"

    /// The saved spots, read without a store (arrival reminders, in the background).
    nonisolated static func savedPlaces(defaults: UserDefaults = .standard) -> [SavedPlace] {
        defaults.data(forKey: placesKey).flatMap { try? JSONDecoder().decode([SavedPlace].self, from: $0) } ?? []
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        enabled = defaults.bool(forKey: Self.enabledKey)
        places = Self.savedPlaces(defaults: defaults)
    }

    var located: Bool { position != nil }
    /// Too vague to tell places apart.
    var imprecise: Bool { (position?.accuracy ?? 0) > PlaceMatching.maxUsableAccuracyMetres }
    var current: CurrentPlace? { enabled ? PlaceMatching.match(position, places) : nil }

    /// What goes with a message: nothing unless location is on and matched.
    var contextForAmrita: LocationContext? { current.map { LocationContext(place: $0.wire) } }

    /// From a tap, so the permission prompt has a clear cause.
    func enable() {
        enabled = true
        defaults.set(true, forKey: Self.enabledKey)
        watch()
        onChange?()
    }

    func disable() {
        enabled = false
        position = nil
        defaults.removeObject(forKey: Self.enabledKey)
        manager.stopUpdatingLocation()
        onChange?()
    }

    /// The app came on screen or left it.
    func setActive(_ active: Bool) {
        self.active = active
        if active { watch() } else if enabled { manager.stopUpdatingLocation() }
    }

    /// Stands in for the phone's position (tests).
    func setPosition(_ position: PlacePosition?) { self.position = position }

    /// One spot per kind: saving again moves it to where they are now.
    func save(_ kind: PlaceKind) {
        guard let position, !imprecise else { return }
        places = places.filter { $0.kind != kind } + [SavedPlace(kind: kind, lat: position.lat, lon: position.lon)]
        persist()
    }

    func remove(_ kind: PlaceKind) {
        places.removeAll { $0.kind == kind }
        persist()
    }

    private func persist() {
        defaults.set(try? JSONEncoder().encode(places), forKey: Self.placesKey)
        onChange?()
    }

    private func watch() {
        guard enabled, active else { return }
        apply(manager.authorizationStatus, reduced: manager.accuracyAuthorization == .reducedAccuracy)
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: manager.startUpdatingLocation()
        default: break
        }
    }

    private func apply(_ status: CLAuthorizationStatus, reduced: Bool) {
        blocked = status == .denied || status == .restricted
        approximateOnly = reduced
        if blocked { position = nil }
    }
}

// The manager was made on the main thread, so it calls back there.
extension PlaceStore: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        let reduced = manager.accuracyAuthorization == .reducedAccuracy
        MainActor.assumeIsolated {
            apply(status, reduced: reduced)
            if !blocked { watch() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last, last.horizontalAccuracy >= 0 else { return }
        let position = PlacePosition(lat: last.coordinate.latitude, lon: last.coordinate.longitude, accuracy: last.horizontalAccuracy)
        MainActor.assumeIsolated {
            guard enabled else { return }
            self.position = position
        }
    }

    /// A failed fix keeps the last one; only a refusal clears it, through the
    /// authorization change.
    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
