import Foundation
import Observation

/// The practice log on this phone, and its sync with the account, following
/// the website (src/hooks/usePracticeLog.ts and usePracticeSync.ts).
///
/// Kept beside the log while signed in:
///   ownerKey  — whose account this phone's log is synced with.
///   ownKey    — ids of the practices this phone had before sign-in; they stay
///               when the person signs out.
///   syncedKey — ids the account is known to have. Anything else is waiting to
///               upload, so a practice finished offline is sent later.
///   cursorKey — how far through the account's log this phone has read.
///   feelingsKey — id → the feeling the account has for it, so a practice
///               rated after it was sent goes again with its rating (H11).
@MainActor
@Observable
final class PracticeStore {
    /// Oldest first.
    private(set) var entries: [PracticeLogEntry]

    var streak: Int { PracticeLog.streak(entries) }

    weak var auth: AuthStore?

    private let api: APIClient
    private let defaults: UserDefaults
    private let fileURL: URL
    private var syncing = false
    private var syncAgain = false

    private static let ownerKey = "pranaveda_practice_owner"
    private static let ownKey = "pranaveda_practice_own_ids"
    private static let syncedKey = "pranaveda_practice_synced_ids"
    private static let cursorKey = "pranaveda_practice_cursor"
    private static let feelingsKey = "pranaveda_practice_sent_feelings"
    /// The server's per-request limit.
    static let batchSize = 25

    init(api: APIClient = APIClient(), defaults: UserDefaults = .standard, fileURL: URL = PracticeStore.defaultFileURL) {
        self.api = api
        self.defaults = defaults
        self.fileURL = fileURL
        entries = (try? Data(contentsOf: fileURL)).flatMap { try? JSONDecoder().decode([PracticeLogEntry].self, from: $0) } ?? []
    }

    /// When the latest practice on this phone finished, read without a store
    /// (arrival reminders, in the background).
    nonisolated static func lastCompletedAt(fileURL: URL = defaultFileURL) -> Date? {
        let entries = (try? Data(contentsOf: fileURL)).flatMap { try? JSONDecoder().decode([PracticeLogEntry].self, from: $0) } ?? []
        return entries.compactMap(\.completedDate).max()
    }

    nonisolated static var defaultFileURL: URL {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return folder.appending(path: "practice-log.json")
    }

    /// Records a finished practice, and sends it to the account when signed in.
    @discardableResult
    func log(kind: PracticeLogEntry.Kind, title: String, durationMinutes: Int, result: RecommendationResult?) -> PracticeLogEntry {
        let entry = PracticeLog.newEntry(kind: kind, title: title, durationMinutes: durationMinutes, result: result)
        setEntries(PracticeLog.trimmed(entries + [entry]))
        if auth?.isSignedIn == true { Task { await sync() } }
        return entry
    }

    /// How a practice left them, from the finish screen; sent when signed in.
    func rate(_ id: String, _ feeling: PracticeLogEntry.Feeling) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        var updated = entries
        updated[index].feeling = feeling
        setEntries(updated)
        if auth?.isSignedIn == true { Task { await sync() } }
    }

    // MARK: The account

    /// After sign-in (and once per launch for a restored session): the first
    /// time for this account, this phone's practices are remembered as its own;
    /// then everything is synced.
    func adoptAccount(_ user: AccountUser) async {
        if defaults.string(forKey: Self.ownerKey) != user.id {
            defaults.set(entries.map(\.id), forKey: Self.ownKey)
            defaults.set([String](), forKey: Self.syncedKey)
            defaults.set(0, forKey: Self.cursorKey)
            defaults.removeObject(forKey: Self.feelingsKey)
            defaults.set(user.id, forKey: Self.ownerKey)
        }
        await sync()
    }

    /// After sign-out (by any route): this phone's own practices stay, the
    /// ones that came from the account leave. One that never reached the
    /// account is kept rather than lost.
    func handBackDevice() {
        guard defaults.string(forKey: Self.ownerKey) != nil else { return }
        let own = Set(defaults.stringArray(forKey: Self.ownKey) ?? [])
        let synced = Set(defaults.stringArray(forKey: Self.syncedKey) ?? [])
        setEntries(entries.filter { own.contains($0.id) || !synced.contains($0.id) })
        for key in [Self.ownerKey, Self.ownKey, Self.syncedKey, Self.cursorKey, Self.feelingsKey] { defaults.removeObject(forKey: key) }
    }

    /// Uploads whatever the account does not have yet, then reads whatever is
    /// new there. One run at a time; a request during a run starts another.
    func sync() async {
        guard defaults.string(forKey: Self.ownerKey) != nil else { return }
        if syncing {
            syncAgain = true
            return
        }
        syncing = true
        defer { syncing = false }
        repeat {
            syncAgain = false
            guard await syncOnce() else { return } // offline or refused: tried again next time
        } while syncAgain
    }

    private func syncOnce() async -> Bool {
        var synced = Set(defaults.stringArray(forKey: Self.syncedKey) ?? [])
        var sentFeelings = defaults.dictionary(forKey: Self.feelingsKey) as? [String: String] ?? [:]
        let pending = PracticeLog.pendingUploads(entries, synced: synced, sentFeelings: sentFeelings)
        for start in stride(from: 0, to: pending.count, by: Self.batchSize) {
            let batch = Array(pending[start..<min(start + Self.batchSize, pending.count)])
            guard await withToken({ [api] token in try await api.uploadPractices(batch, accessToken: token) }) != nil else { return false }
            for entry in batch {
                synced.insert(entry.id)
                if let feeling = entry.feeling { sentFeelings[entry.id] = feeling.rawValue }
            }
            defaults.set(Array(synced), forKey: Self.syncedKey)
            defaults.set(sentFeelings, forKey: Self.feelingsKey)
        }

        var cursor = defaults.integer(forKey: Self.cursorKey)
        while true {
            let after = cursor
            guard let page = await withToken({ [api] token in try await api.practices(after: after, accessToken: token) }) else { return false }
            if !page.entries.isEmpty {
                setEntries(PracticeLog.merged(entries, with: page.entries))
                for entry in page.entries {
                    synced.insert(entry.id)
                    if let feeling = entry.feeling, sentFeelings[entry.id] == nil { sentFeelings[entry.id] = feeling.rawValue }
                }
                defaults.set(Array(synced), forKey: Self.syncedKey)
                defaults.set(sentFeelings, forKey: Self.feelingsKey)
            }
            cursor = page.cursor
            defaults.set(cursor, forKey: Self.cursorKey)
            if !page.hasMore { return true }
        }
    }

    /// Runs a request as the signed-in person, refreshing once if the sign-in
    /// had expired. Nil when signed out, offline or refused.
    private func withToken<T>(_ request: (String) async throws -> T) async -> T? {
        guard let auth, var token = await auth.validAccessToken() else { return nil }
        do {
            return try await request(token)
        } catch APIError.http(401) {
            guard let fresh = await auth.tokenAfterRejection() else { return nil }
            token = fresh
            return try? await request(token)
        } catch {
            return nil
        }
    }

    private func setEntries(_ value: [PracticeLogEntry]) {
        entries = value
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(value).write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            // The log stays in memory for this launch; saving is tried again with the next change.
        }
    }
}
