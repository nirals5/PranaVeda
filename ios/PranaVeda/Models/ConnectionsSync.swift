import Foundation
import Observation

/// Saved places kept on the account once the user turns that on, so the
/// website and their other devices use the same ones (the website keeps its
/// calendar link there too; the app leaves it alone). Off by default: until
/// then places stay on this phone. While on, the account's places are the
/// ones in use, and a change here is sent straight away. The website's
/// useConnectionsSync follows the same rules.
enum ConnectionsMerge {
    private static let order: [PlaceKind] = [.home, .work, .studio, .outdoors]

    /// A phone joining an account that already keeps them: the account's spot
    /// wins for each kind, this phone adds kinds the account lacks.
    static func join(account: [SavedPlace], phone: [SavedPlace]) -> [SavedPlace] {
        let kinds = Set(account.map(\.kind))
        return sorted(account + phone.filter { !kinds.contains($0.kind) })
    }

    static func same(_ a: [SavedPlace], _ b: [SavedPlace]) -> Bool { sorted(a) == sorted(b) }

    private static func sorted(_ places: [SavedPlace]) -> [SavedPlace] {
        places.sorted { order.firstIndex(of: $0.kind)! < order.firstIndex(of: $1.kind)! }
    }
}

/// What the server answers: the account's places (and version), or that it
/// keeps none. `conflict` is set when a write was based on an older version.
struct AccountConnections: Decodable {
    struct Stored: Decodable { let places: [SavedPlace] }
    let kept: Bool
    let connections: Stored
    let version: Int
    var conflict = false

    private enum CodingKeys: String, CodingKey { case kept, connections, version }
}

@MainActor
@Observable
final class ConnectionsSync {
    /// Nil until the account has been asked.
    private(set) var kept: Bool?
    private(set) var pending = false
    private(set) var failed = false

    @ObservationIgnored weak var auth: AuthStore?
    @ObservationIgnored weak var place: PlaceStore?

    private let api: APIClient
    private let defaults: UserDefaults
    @ObservationIgnored private var syncing = false
    @ObservationIgnored private var syncAgain = false

    /// Whose account this phone follows.
    private static let ownerKey = "pranaveda_connections_owner"
    /// The account version this phone's places match; 0 when not following.
    private static let versionKey = "pranaveda_connections_version"
    /// Those places, so a change here is noticed.
    private static let agreedKey = "pranaveda_connections_synced"
    /// This phone's own places from before it followed the account; put back on sign-out.
    private static let ownKey = "pranaveda_connections_own"

    init(api: APIClient = APIClient(), defaults: UserDefaults = .standard) {
        self.api = api
        self.defaults = defaults
    }

    private var version: Int { defaults.integer(forKey: Self.versionKey) }
    private var agreed: [SavedPlace] { places(Self.agreedKey) ?? [] }
    private var phonePlaces: [SavedPlace] { place?.places ?? [] }

    private func places(_ key: String) -> [SavedPlace]? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode([SavedPlace].self, from: $0) }
    }

    private func setPlaces(_ value: [SavedPlace]?, _ key: String) {
        if let value { defaults.set(try? JSONEncoder().encode(value), forKey: key) } else { defaults.removeObject(forKey: key) }
    }

    // MARK: Signing in and out

    /// After sign-in, and once per launch for a restored session.
    func adoptAccount(_ user: AccountUser) async {
        if defaults.string(forKey: Self.ownerKey) != user.id {
            for key in [Self.versionKey, Self.agreedKey, Self.ownKey] { defaults.removeObject(forKey: key) }
            defaults.set(user.id, forKey: Self.ownerKey)
        }
        await sync()
    }

    /// After sign-out: this phone goes back to its own places.
    func handBackDevice() {
        guard defaults.string(forKey: Self.ownerKey) != nil else { return }
        if version > 0, let own = places(Self.ownKey) { place?.replace(own) }
        for key in [Self.ownerKey, Self.versionKey, Self.agreedKey, Self.ownKey] { defaults.removeObject(forKey: key) }
        kept = nil
    }

    /// A place was saved, moved or removed here.
    func placesChanged() {
        guard version > 0, !ConnectionsMerge.same(phonePlaces, agreed) else { return }
        Task { await sync() }
    }

    // MARK: The switch

    func turnOn() async {
        pending = true
        failed = false
        defer { pending = false }
        setPlaces(phonePlaces, Self.ownKey)
        let mine = phonePlaces
        guard let reply = await withToken({ try await self.api.saveConnections(places: mine, baseVersion: 0, accessToken: $0) }) else {
            failed = true
            return
        }
        if reply.conflict {
            // Another device turned it on first: join it.
            defaults.set(0, forKey: Self.versionKey)
            await sync()
        } else {
            settle(reply)
        }
    }

    /// Nothing stays on the account; this phone keeps what it has now.
    func turnOff() async {
        pending = true
        failed = false
        defer { pending = false }
        guard await withToken({ try await self.api.forgetConnections(accessToken: $0) }) != nil else {
            failed = true
            return
        }
        stopFollowing()
    }

    // MARK: Syncing

    /// Sends a change made here, or takes the account's places (joining them
    /// first if this phone isn't following yet). One run at a time.
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
        let version = version
        if version > 0, !ConnectionsMerge.same(phonePlaces, agreed) {
            let mine = phonePlaces
            var reply = await withToken { try await self.api.saveConnections(places: mine, baseVersion: version, accessToken: $0) }
            // Changed elsewhere meanwhile: this phone's change is the newest.
            if let first = reply, first.conflict, first.kept {
                reply = await withToken { try await self.api.saveConnections(places: mine, baseVersion: first.version, accessToken: $0) }
            }
            guard let reply else { return false }
            settle(reply)
            return true
        }
        guard let account = await withToken({ try await self.api.connections(accessToken: $0) }) else { return false }
        guard account.kept else {
            if version > 0 { stopFollowing() } else { kept = false }
            return true
        }
        if version == 0 {
            setPlaces(phonePlaces, Self.ownKey)
            let joined = ConnectionsMerge.join(account: account.connections.places, phone: phonePlaces)
            if !ConnectionsMerge.same(joined, account.connections.places) {
                guard let reply = await withToken({ try await self.api.saveConnections(places: joined, baseVersion: account.version, accessToken: $0) })
                else { return false }
                if reply.conflict { syncAgain = true } else { settle(reply) }
                return true
            }
        }
        use(account.connections.places, version: account.version)
        return true
    }

    private func settle(_ reply: AccountConnections) {
        if reply.kept { use(reply.connections.places, version: reply.version) } else { stopFollowing() }
    }

    private func use(_ places: [SavedPlace], version: Int) {
        setPlaces(places, Self.agreedKey)
        defaults.set(version, forKey: Self.versionKey)
        place?.replace(places)
        kept = true
    }

    private func stopFollowing() {
        defaults.set(0, forKey: Self.versionKey)
        for key in [Self.agreedKey, Self.ownKey] { defaults.removeObject(forKey: key) }
        kept = false
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
}

extension APIClient {
    func connections(accessToken: String) async throws -> AccountConnections {
        try await connectionsRequest(method: "GET", body: nil, accessToken: accessToken)
    }

    /// Places only: the account's calendar link (from the website) is left as it is.
    func saveConnections(places: [SavedPlace], baseVersion: Int, accessToken: String) async throws -> AccountConnections {
        struct Body: Encodable { let places: [SavedPlace]; let baseVersion: Int }
        return try await connectionsRequest(method: "PUT", body: try JSONEncoder().encode(Body(places: places, baseVersion: baseVersion)), accessToken: accessToken)
    }

    func forgetConnections(accessToken: String) async throws -> AccountConnections {
        try await connectionsRequest(method: "DELETE", body: nil, accessToken: accessToken)
    }

    private func connectionsRequest(method: String, body: Data?, accessToken: String) async throws -> AccountConnections {
        var request = URLRequest(url: baseURL.appending(path: "api/sync/connections"))
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 || status == 409 else { throw APIError.http(status) }
        var reply = try JSONDecoder().decode(AccountConnections.self, from: data)
        reply.conflict = status == 409
        return reply
    }
}
