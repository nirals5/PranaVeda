import Foundation

/// One finished practice, as the website records it (PracticeLogEntry in
/// src/types.ts), so the account's log reads the same on every device.
struct PracticeLogEntry: Codable, Hashable, Sendable, Identifiable {
    enum Kind: String, Codable, Sendable { case ritual, breathwork }

    /// "How do you feel now?" after the practice (H11). Amrita leans away
    /// from practices that leave them less settled.
    enum Feeling: String, Codable, Sendable, CaseIterable {
        case more, same, less

        var label: String {
            switch self {
            case .more: "More settled"
            case .same: "About the same"
            case .less: "Less settled"
            }
        }
    }

    let id: String
    let kind: Kind
    let title: String
    /// ISO 8601 timestamp.
    let completedAt: String
    /// "YYYY-MM-DD" in the person's own timezone: the calendar key.
    let localDate: String
    let durationMinutes: Int
    /// The ritual as it was shown, so the day can reopen it. Only the newest
    /// entries keep theirs.
    var result: RecommendationResult?
    /// How it left them, if they said.
    var feeling: Feeling?
    /// Heart rate across it, when an Apple Watch (or, on the website, a
    /// Bluetooth strap) was reading it.
    var heart: HeartSummary?

    init(id: String, kind: Kind, title: String, completedAt: String, localDate: String, durationMinutes: Int, result: RecommendationResult?, feeling: Feeling? = nil, heart: HeartSummary? = nil) {
        self.id = id
        self.kind = kind
        self.title = title
        self.completedAt = completedAt
        self.localDate = localDate
        self.durationMinutes = durationMinutes
        self.result = result
        self.feeling = feeling
        self.heart = heart
    }

    private enum Keys: String, CodingKey { case id, kind, title, completedAt, localDate, durationMinutes, result, feeling, heart }

    // Entries from other devices may carry fields or ritual shapes this app
    // does not know; an unreadable ritual is dropped rather than the entry.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(Kind.self, forKey: .kind)
        title = try c.decode(String.self, forKey: .title)
        completedAt = try c.decode(String.self, forKey: .completedAt)
        localDate = try c.decode(String.self, forKey: .localDate)
        durationMinutes = try c.decode(Int.self, forKey: .durationMinutes)
        result = try? c.decodeIfPresent(RecommendationResult.self, forKey: .result)
        feeling = try? c.decodeIfPresent(Feeling.self, forKey: .feeling)
        heart = try? c.decodeIfPresent(HeartSummary.self, forKey: .heart)
    }

    var completedDate: Date? { PracticeLog.isoFormatter.date(from: completedAt) ?? PracticeLog.isoFormatterNoFraction.date(from: completedAt) }
}

/// The rules of the practice log, shared with the website (src/hooks/usePracticeLog.ts).
enum PracticeLog {
    static let maxEntries = 500
    /// Ritual snapshots are a few KB each; only the newest entries keep theirs.
    static let maxSnapshots = 40

    nonisolated(unsafe) static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) static let isoFormatterNoFraction = ISO8601DateFormatter()

    /// A new entry, finished now. Ids look like the website's ("p_<ms>_<5 chars>").
    static func newEntry(kind: PracticeLogEntry.Kind, title: String, durationMinutes: Int, result: RecommendationResult?,
                         now: Date = Date(), timeZone: TimeZone = .current) -> PracticeLogEntry {
        let millis = Int(now.timeIntervalSince1970 * 1000)
        let suffix = String((0..<5).map { _ in "abcdefghijklmnopqrstuvwxyz0123456789".randomElement()! })
        return PracticeLogEntry(
            id: "p_\(millis)_\(suffix)",
            kind: kind,
            title: title,
            completedAt: isoFormatter.string(from: now),
            localDate: ChatViewModel.localDate(now, in: timeZone),
            durationMinutes: durationMinutes,
            result: result
        )
    }

    /// At most `maxEntries`, oldest first; only the newest `maxSnapshots` keep their ritual.
    static func trimmed(_ entries: [PracticeLogEntry]) -> [PracticeLogEntry] {
        let kept = Array(entries.suffix(maxEntries))
        let snapshotFrom = kept.count - maxSnapshots
        return kept.enumerated().map { index, entry in
            guard index < snapshotFrom, entry.result != nil else { return entry }
            var lean = entry
            lean.result = nil
            return lean
        }
    }

    /// Adds entries from elsewhere. An id seen twice is the same practice and
    /// is kept once; the copy here wins, since the only later change (how it
    /// left them) is made on the device that ran it.
    static func merged(_ local: [PracticeLogEntry], with incoming: [PracticeLogEntry]) -> [PracticeLogEntry] {
        let known = Set(local.map(\.id))
        let added = incoming.filter { !known.contains($0.id) }
        guard !added.isEmpty else { return local }
        return trimmed((local + added).sorted { ($0.completedDate ?? .distantPast) < ($1.completedDate ?? .distantPast) })
    }

    /// Consecutive days with at least one practice. The streak stays alive
    /// through today until the day ends, so it counts back from yesterday when
    /// today has no practice yet.
    static func streak(_ entries: [PracticeLogEntry], today: Date = Date(), timeZone: TimeZone = .current) -> Int {
        let days = Set(entries.map(\.localDate))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        var cursor = calendar.startOfDay(for: today)
        if !days.contains(ChatViewModel.localDate(cursor, in: timeZone)) {
            cursor = calendar.date(byAdding: .day, value: -1, to: cursor)!
        }
        var streak = 0
        while days.contains(ChatViewModel.localDate(cursor, in: timeZone)) {
            streak += 1
            cursor = calendar.date(byAdding: .day, value: -1, to: cursor)!
        }
        return streak
    }
}

extension PracticeLog {
    /// What the account is missing: new practices, and ratings it has not had.
    static func pendingUploads(_ entries: [PracticeLogEntry], synced: Set<String>, sentFeelings: [String: String]) -> [PracticeLogEntry] {
        entries.filter { !synced.contains($0.id) || ($0.feeling != nil && sentFeelings[$0.id] != $0.feeling?.rawValue) }
    }
}

/// A page of the account's practice log.
struct PracticePage: Decodable, Sendable {
    let entries: [PracticeLogEntry]
    let cursor: Int
    let hasMore: Bool
}

extension APIClient {
    /// Sends practices the account may not have yet (at most 25). Sending one
    /// it already has is fine. Throws `APIError.http(401)` for an expired sign-in.
    func uploadPractices(_ entries: [PracticeLogEntry], accessToken: String) async throws {
        struct Body: Encodable { let entries: [PracticeLogEntry] }
        var request = URLRequest(url: baseURL.appending(path: "api/sync/practice-log"))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(Body(entries: entries))
        let (_, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw APIError.http(status) }
    }

    /// The account's practices received after `cursor` (0 for all), oldest first.
    func practices(after cursor: Int, accessToken: String) async throws -> PracticePage {
        var components = URLComponents(url: baseURL.appending(path: "api/sync/practice-log"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "after", value: String(cursor))]
        var request = URLRequest(url: components.url!)
        request.timeoutInterval = 30
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw APIError.http(status) }
        return try JSONDecoder().decode(PracticePage.self, from: data)
    }
}
