import Foundation
import Observation

/// A bookmarked ritual, in the website's shape (SavedPractice in
/// src/types.ts), so the account's list reads the same on every device.
struct SavedRitual: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let title: String
    /// When it was saved, as shown: "Oct 17".
    let date: String
    /// What led to it. The website keeps the request typed before it; here
    /// the ritual comes from a conversation.
    let query: String
    let category: String
    let result: RecommendationResult
}

/// The saved rituals on this phone, newest first, and their sync with the
/// account, following the website (src/hooks/useSavedRituals.ts). Unlike the
/// practice log a ritual can be removed, and a removal travels too.
///
/// Kept beside the list while signed in:
///   ownerKey   — whose account this phone's list is synced with.
///   ownKey     — ids this phone had before sign-in; they stay on sign-out.
///   syncedKey  — ids the account is known to have. Anything else is waiting
///                to upload, so a ritual saved offline is sent later.
///   removedKey — ids removed here that the account has not heard about yet.
@MainActor
@Observable
final class SavedRitualStore {
    private(set) var rituals: [SavedRitual]
    weak var auth: AuthStore?

    private let fileURL: URL
    private let api: APIClient
    private let defaults: UserDefaults
    private var syncing = false
    private var syncAgain = false

    private static let ownerKey = "pranaveda_saved_owner"
    private static let ownKey = "pranaveda_saved_own_ids"
    private static let syncedKey = "pranaveda_saved_synced_ids"
    private static let removedKey = "pranaveda_saved_removed_ids"
    /// The server's per-request limits.
    static let saveBatch = 25
    static let removeBatch = 100

    init(fileURL: URL = SavedRitualStore.defaultFileURL, api: APIClient = APIClient(), defaults: UserDefaults = .standard) {
        self.fileURL = fileURL
        self.api = api
        self.defaults = defaults
        rituals = (try? Data(contentsOf: fileURL)).flatMap { try? JSONDecoder().decode([SavedRitual].self, from: $0) } ?? []
    }

    nonisolated static var defaultFileURL: URL {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return folder.appending(path: "saved-rituals.json")
    }

    /// The same ritual (every detail alike) counts as saved once.
    func isSaved(_ result: RecommendationResult) -> Bool {
        rituals.contains { $0.result == result }
    }

    /// Saves the ritual, or removes it if it is already saved. Returns whether
    /// it is saved afterwards.
    @discardableResult
    func toggle(_ result: RecommendationResult, now: Date = Date()) -> Bool {
        if isSaved(result) {
            removeSaved(ids: rituals.filter { $0.result == result }.map(\.id))
            return false
        }
        let saved = SavedRitual(
            // Like the practice log's ids, unique even for two saves in one millisecond.
            id: "save_\(Int(now.timeIntervalSince1970 * 1000))_\(String((0..<5).map { _ in "abcdefghijklmnopqrstuvwxyz0123456789".randomElement()! }))",
            title: result.yogaPractice.title,
            date: Self.savedDate(now),
            query: "Conversation with Amrita",
            category: "Yoga",
            result: result
        )
        store([saved] + rituals)
        if auth?.isSignedIn == true { Task { await sync() } }
        return true
    }

    func remove(_ ritual: SavedRitual) {
        removeSaved(ids: [ritual.id])
    }

    private func removeSaved(ids: [String]) {
        store(rituals.filter { !ids.contains($0.id) })
        // Only the account needs telling, and only once this phone syncs with one.
        guard defaults.string(forKey: Self.ownerKey) != nil else { return }
        defaults.set(Array(Set(defaults.stringArray(forKey: Self.removedKey) ?? []).union(ids)), forKey: Self.removedKey)
        if auth?.isSignedIn == true { Task { await sync() } }
    }

    // MARK: The account

    /// After sign-in (and once per launch for a restored session): the first
    /// time for this account, this phone's rituals are remembered as its own;
    /// then everything is synced.
    func adoptAccount(_ user: AccountUser) async {
        if defaults.string(forKey: Self.ownerKey) != user.id {
            defaults.set(rituals.map(\.id), forKey: Self.ownKey)
            defaults.set([String](), forKey: Self.syncedKey)
            defaults.set([String](), forKey: Self.removedKey)
            defaults.set(user.id, forKey: Self.ownerKey)
        }
        await sync()
    }

    /// After sign-out (by any route): this phone's own rituals stay, the ones
    /// from the account leave. One that never reached the account is kept.
    func handBackDevice() {
        guard defaults.string(forKey: Self.ownerKey) != nil else { return }
        let own = Set(defaults.stringArray(forKey: Self.ownKey) ?? [])
        let synced = Set(defaults.stringArray(forKey: Self.syncedKey) ?? [])
        store(rituals.filter { own.contains($0.id) || !synced.contains($0.id) })
        for key in [Self.ownerKey, Self.ownKey, Self.syncedKey, Self.removedKey] { defaults.removeObject(forKey: key) }
    }

    /// Sends what was removed and saved here, then takes the account's list.
    /// One run at a time; a request during a run starts another.
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
        var removes = defaults.stringArray(forKey: Self.removedKey) ?? []
        while !removes.isEmpty {
            let batch = Array(removes.prefix(Self.removeBatch))
            guard await withToken({ [api] token in try await api.sendSavedChanges(saves: [], removes: batch, accessToken: token) }) != nil else { return false }
            removes.removeFirst(batch.count)
            defaults.set(removes, forKey: Self.removedKey)
        }

        var synced = Set(defaults.stringArray(forKey: Self.syncedKey) ?? [])
        let pending = rituals.filter { !synced.contains($0.id) }
        for start in stride(from: 0, to: pending.count, by: Self.saveBatch) {
            let batch = Array(pending[start..<min(start + Self.saveBatch, pending.count)])
            guard await withToken({ [api] token in try await api.sendSavedChanges(saves: batch, removes: [], accessToken: token) }) != nil else { return false }
            batch.forEach { synced.insert($0.id) }
            defaults.set(Array(synced), forKey: Self.syncedKey)
        }

        guard let account = await withToken({ [api] token in try await api.savedRituals(accessToken: token) }) else { return false }
        let merged = Self.reconcile(local: rituals, account: account, synced: synced,
                                    pendingRemoves: Set(defaults.stringArray(forKey: Self.removedKey) ?? []))
        store(merged.rituals)
        defaults.set(merged.synced, forKey: Self.syncedKey)
        return true
    }

    /// How this phone's list and the account's come together (the website's
    /// reconcileSaved): a ritual the account no longer has, that this phone
    /// knew it had, was removed elsewhere; one the account has and this phone
    /// does not (and did not just remove) was saved elsewhere. Anything not
    /// yet synced stays. Newest first.
    nonisolated static func reconcile(local: [SavedRitual], account: [SavedRitual], synced: Set<String>, pendingRemoves: Set<String>)
        -> (rituals: [SavedRitual], synced: [String]) {
        let accountIds = Set(account.map(\.id))
        let kept = local.filter { !(synced.contains($0.id) && !accountIds.contains($0.id)) }
        let keptIds = Set(kept.map(\.id))
        let arrived = account.filter { !keptIds.contains($0.id) && !pendingRemoves.contains($0.id) }
        let rituals = (arrived + kept).enumerated()
            .sorted { savedMillis($0.element.id) != savedMillis($1.element.id) ? savedMillis($0.element.id) > savedMillis($1.element.id) : $0.offset < $1.offset }
            .map(\.element)
        return (rituals, accountIds.subtracting(pendingRemoves).sorted())
    }

    /// When a ritual was saved, from its id ("save_1760000000000_ab12c"). 0 if unknown.
    nonisolated static func savedMillis(_ id: String) -> Int {
        guard let range = id.range(of: #"_(\d{12,})"#, options: .regularExpression) else { return 0 }
        return Int(id[range].dropFirst()) ?? 0
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

    /// "Oct 17", as the website writes it.
    nonisolated static func savedDate(_ date: Date, locale: Locale = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("MMM d")
        return formatter.string(from: date)
    }

    private func store(_ value: [SavedRitual]) {
        rituals = value
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(value).write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            // Kept in memory for this launch; saving is tried again with the next change.
        }
    }
}

extension APIClient {
    /// Rituals saved (at most 25) and removed (at most 100) on this phone.
    /// Sending one the account already has, or already removed, is fine.
    func sendSavedChanges(saves: [SavedRitual], removes: [String], accessToken: String) async throws {
        struct Body: Encodable { let saves: [SavedRitual]; let removes: [String] }
        var request = URLRequest(url: baseURL.appending(path: "api/sync/saved-rituals"))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(Body(saves: saves, removes: removes))
        let (_, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw APIError.http(status) }
    }

    /// The account's saved rituals, newest first. One the phone cannot read is skipped.
    func savedRituals(accessToken: String) async throws -> [SavedRitual] {
        struct Page: Decodable { let rituals: [Lenient] }
        struct Lenient: Decodable {
            let ritual: SavedRitual?
            init(from decoder: Decoder) throws { ritual = try? SavedRitual(from: decoder) }
        }
        var request = URLRequest(url: baseURL.appending(path: "api/sync/saved-rituals"))
        request.timeoutInterval = 30
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw APIError.http(status) }
        return try JSONDecoder().decode(Page.self, from: data).rituals.compactMap(\.ritual)
    }
}
