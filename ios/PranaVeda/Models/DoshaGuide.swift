import Foundation

/// The balancing reference behind the Dosha Profile screen, from
/// GET /api/dosha-guide (the website shows the same text).
struct DoshaGuide: Decodable, Sendable {
    let doshas: [String: DoshaGuideEntry]
    let note: String
}

struct DoshaGuideEntry: Decodable, Hashable, Sendable {
    let tagline: String
    let qualities: String
    let aggravatedBy: String
    let balancedBy: String
    let diet: [String]
    let lifestyle: [String]
    let breath: String
    let practiceStyle: String
    let rhythm: String
    let season: String
}

/// The dosha assessment Amrita saved to the wellness profile
/// (`profile.doshaProfile`): the card's fields plus the day it was made.
struct SavedDoshaProfile: Decodable, Hashable, Sendable {
    let primary: String
    let secondary: String?
    let balance: DoshaBalance
    let essence: String?
    let explanation: String?
    let guidance: [String]?
    let confidence: String?
    let assessedDate: String?

    /// Read from the profile as stored; nil if there is none or it is incomplete.
    init?(profile: JSONValue) {
        guard let value = profile["doshaProfile"],
              let data = try? JSONEncoder().encode(value),
              let decoded = try? JSONDecoder().decode(Self.self, from: data) else { return nil }
        self = decoded
    }
}

extension APIClient {
    func doshaGuide() async throws -> DoshaGuide {
        let (data, response) = try await session.data(from: baseURL.appending(path: "api/dosha-guide"))
        if let http = response as? HTTPURLResponse, http.statusCode != 200 { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(DoshaGuide.self, from: data)
    }
}

@MainActor
@Observable
final class DoshaGuideStore {
    private(set) var guide: DoshaGuide?
    private let api: APIClient

    init(api: APIClient = APIClient()) {
        self.api = api
    }

    /// The screen still shows the person's own assessment without the guide;
    /// it is loaded again next time the screen appears.
    func loadIfNeeded() async {
        guard guide == nil else { return }
        guide = try? await api.doshaGuide()
    }
}
