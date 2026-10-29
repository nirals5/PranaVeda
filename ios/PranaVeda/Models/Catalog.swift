import Foundation

/// The practice catalog from GET /api/catalog.
struct Catalog: Decodable, Sendable {
    let poses: [CatalogPose]
    let breathwork: [CatalogBreathwork]
    /// Advanced poses Amrita never offers (G3), for Library → Explore. Absent
    /// from servers older than Explore.
    let explore: [ExplorePose]?
}

/// An explore-only pose: shown with an at-your-own-risk note, never guided,
/// never logged.
struct ExplorePose: Decodable, Hashable, Sendable, Identifiable {
    struct Condition: Decodable, Hashable, Sendable {
        let code: String
        let label: String
        let words: [String]
    }

    let id: String
    let nameSanskrit: String
    let nameEnglish: String
    let bodyFocus: String
    let benefits: String
    let cues: [String]
    let commonMistakes: [String]
    let modifications: String
    let avoidWith: [Condition]
    let sourceCaution: String?
    let followWith: String?
    let avoidAfterMeal: Bool?

    /// The conditions on their profile this pose must be avoided with, by the
    /// server's matching (conditionConflicts in api/_lib/catalog.ts): a whole
    /// word or phrase of the code, label or everyday words, or the older text
    /// match on the code.
    func notFor(_ profileConditions: [String]) -> [String] {
        let said = profileConditions.map(Self.words)
        let older = profileConditions.map { $0.lowercased().replacingOccurrences(of: " ", with: "_") }
        return avoidWith.filter { c in
            let terms = ([c.code, c.label] + c.words).map(Self.words).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            return said.contains { s in terms.contains { s.contains($0) } }
                || older.contains { $0.contains(c.code) || c.code.contains($0) }
        }
        .map(\.label)
    }

    /// "Bad Knee!" → " bad knee ", so a phrase matches only as whole words.
    private static func words(_ s: String) -> String {
        let spaced = s.lowercased().map { $0.isLetter || $0.isNumber ? String($0) : " " }.joined()
        return " " + spaced.split(separator: " ").joined(separator: " ") + " "
    }
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
