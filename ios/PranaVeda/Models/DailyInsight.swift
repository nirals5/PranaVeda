import Foundation
import Observation

/// Amrita's short daily reflection, as on the website's home page
/// (src/components/WellnessInsight.tsx, served by POST /api/insight).
struct DailyInsight: Decodable, Equatable, Sendable {
    let headline: String
    let quote: String
    /// A practice name, e.g. "Sama Vritti".
    let focus: String
    let tip: String
    /// The server's stand-in when Claude could not be reached.
    var isFallback = false

    private enum Keys: String, CodingKey { case headline, quote, focus, tip, isFallback = "_isFallback" }

    init(headline: String, quote: String, focus: String, tip: String, isFallback: Bool = false) {
        self.headline = headline
        self.quote = quote
        self.focus = focus
        self.tip = tip
        self.isFallback = isFallback
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        headline = try c.decode(String.self, forKey: .headline)
        quote = try c.decode(String.self, forKey: .quote)
        focus = try c.decode(String.self, forKey: .focus)
        tip = try c.decode(String.self, forKey: .tip)
        isFallback = try c.decodeIfPresent(Bool.self, forKey: .isFallback) ?? false
    }
}

/// One reflection per launch, like the website's one per visit: fresh each
/// time the app starts, steady while it runs. A stand-in reply is shown but
/// not kept, so the next visit to the screen asks again.
@MainActor
@Observable
final class DailyInsightStore {
    enum State: Equatable {
        case loading
        case loaded(DailyInsight)
        /// Offline or the server failed: the screen shows the website's
        /// offline words instead.
        case unavailable
    }

    private(set) var state: State = .loading
    private let fetch: @Sendable (JSONValue, String) async throws -> DailyInsight
    private var inFlight = false

    init(fetch: @escaping @Sendable (JSONValue, String) async throws -> DailyInsight) {
        self.fetch = fetch
    }

    convenience init(api: APIClient = APIClient()) {
        self.init { profile, localTime in try await api.dailyInsight(profile: profile, localTime: localTime) }
    }

    /// The wellness profile makes the reflection personal (the server never
    /// mentions it outright).
    func loadIfNeeded(profile: JSONValue, now: Date = Date()) async {
        if case .loaded(let insight) = state, !insight.isFallback { return }
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        if case .unavailable = state { state = .loading }
        do {
            state = .loaded(try await fetch(profile, now.formatted(date: .numeric, time: .standard)))
        } catch {
            state = .unavailable
        }
    }
}

extension APIClient {
    func dailyInsight(profile: JSONValue, localTime: String) async throws -> DailyInsight {
        struct Body: Encodable { let profile: JSONValue; let localTime: String }
        var request = URLRequest(url: baseURL.appending(path: "api/insight"))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(Body(profile: profile, localTime: localTime))
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw APIError.http(status) }
        return try JSONDecoder().decode(DailyInsight.self, from: data)
    }
}
