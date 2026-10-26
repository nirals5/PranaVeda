import Foundation

/// The practice catalog from GET /api/catalog.
struct Catalog: Decodable, Sendable {
    let poses: [CatalogPose]
    let breathwork: [CatalogBreathwork]
}

struct CatalogPose: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let nameSanskrit: String
    let nameEnglish: String
    let level: String
    let bodyFocus: String
    let cues: [String]
    let benefits: String
    let modifications: String?
    let contraindications: [String]
    let bestTime: String?
    let defaultDurationMin: Double?
    let poseImageUrl: String?
    let sceneImageUrl: String?
    /// "experienced" for the few practices Amrita offers only to experienced practitioners.
    let minExperience: String?

    var imageURL: URL? { AppConfig.resolve(sceneImageUrl ?? poseImageUrl) }
    var experiencedOnly: Bool { minExperience == "experienced" }
}

struct CatalogBreathwork: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let name: String
    let sanskritName: String
    let description: String
    let inhale: Double
    let holdActive: Double
    let exhale: Double
    let holdEmpty: Double
    let cycles: Int
    let benefits: String
}

@MainActor
@Observable
final class CatalogStore {
    private(set) var catalog: Catalog?
    private(set) var loadError: String?
    private let api: APIClient

    init(api: APIClient = APIClient()) {
        self.api = api
    }

    func loadIfNeeded() async {
        guard catalog == nil else { return }
        await load()
    }

    func load() async {
        loadError = nil
        do {
            catalog = try await api.catalog()
        } catch {
            loadError = "The library could not be loaded. Is the PranaVeda server running?"
        }
    }
}
