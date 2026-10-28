import Foundation
import Observation

/// The conversation with Amrita.
///
/// Signed out, the wellness profile lives on this device and travels with
/// each message, as in the signed-out web app. Signed in, the server reads and
/// saves the profile in the account instead (the copy sent is ignored), and the
/// copy here is kept in step with it.
@MainActor
@Observable
final class ChatViewModel {
    private(set) var items: [ChatItem] = []
    private(set) var isStreaming = false
    private(set) var profile: JSONValue

    /// Set when sign-in is available; requests are then sent as the
    /// signed-in person.
    weak var auth: AuthStore?

    /// Speaks the reply to a spoken message (the app's AmritaVoice), and
    /// stops whatever is still being said.
    var speakReply: ((String) -> Void)?
    var stopSpeaking: (() -> Void)?

    /// Their readings for Amrita (HealthStore.summaryForAmrita): nil unless
    /// they have let her see them.
    var healthForAmrita: (() -> HealthSummary?)?
    /// The kind of place they are in (PlaceStore.contextForAmrita): nil
    /// unless they have turned location on.
    var locationForAmrita: (() -> LocationContext?)?

    private let api: APIClient
    private let defaults: UserDefaults
    private var streamTask: Task<Void, Never>?

    private static let profileKey = "pranaveda_profile"
    // While signed in, the profile here is a copy of the account's. These
    // record whose it is, and the device's own profile from before sign-in,
    // which is put back on sign-out (as on the website).
    private static let ownerKey = "pranaveda_profile_owner"
    private static let backupKey = "pranaveda_profile_before_signin"

    init(api: APIClient = APIClient(), defaults: UserDefaults = .standard) {
        self.api = api
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.profileKey),
           let stored = try? JSONDecoder().decode(JSONValue.self, from: data) {
            profile = stored
        } else {
            profile = .object([:])
        }
    }

    var profileName: String? { profile["name"]?.stringValue }
    /// "beginner", "regular" or "experienced"; nil when not set (G2).
    var experience: String? { profile["experience"]?.stringValue }

    /// The device's calendar day as "YYYY-MM-DD", in whatever timezone it is
    /// in right now.
    nonisolated static func localDate(_ date: Date, in timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// Sends a message. A `spoken` one is marked as voice for the server, and
    /// its reply is read aloud, as on the website.
    func send(_ text: String, spoken: Bool = false) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isStreaming else { return }
        stopSpeaking?()

        items.append(ChatItem(role: .user, text: trimmed))
        let history = items.map { ChatItem.Message(role: $0.role.rawValue, content: $0.modelContent) }
            .filter { !$0.content.isEmpty }
            .suffix(30)
        let reply = ChatItem(role: .assistant, streaming: true)
        items.append(reply)
        isStreaming = true

        let now = Date()
        let request = APIClient.ChatRequest(
            messages: Array(history).map { .init(role: $0.role, content: $0.content) },
            profile: profile,
            localTime: now.formatted(date: .numeric, time: .standard),
            localDate: Self.localDate(now),
            inputMode: spoken ? "voice" : "text",
            previousSession: nil,
            health: healthForAmrita?(),
            location: locationForAmrita?()
        )

        streamTask = Task { [weak self] in
            guard let self else { return }
            do {
                var token = await auth?.validAccessToken()
                do {
                    try await stream(request, bearer: token, into: reply.id)
                } catch APIError.http(401) where token != nil {
                    // The sign-in had expired: refresh once and resend. If the
                    // session is over, the resend goes out signed out.
                    token = await auth?.tokenAfterRejection()
                    try await stream(request, bearer: token, into: reply.id)
                }
            } catch is CancellationError {
            } catch {
                update(reply.id) { item in
                    item.failed = true
                    if item.text.isEmpty {
                        item.text = "I lost the thread of our connection for a moment. Please try sending that again — I am still here."
                    }
                }
            }
            update(reply.id) { $0.streaming = false }
            isStreaming = false
            // Speak in kind: cards stay silent, Amrita's own sentence introduces them.
            if spoken, let said = items.first(where: { $0.id == reply.id }), !said.failed, !said.text.isEmpty {
                speakReply?(said.text)
            }
        }
    }

    private func stream(_ request: APIClient.ChatRequest, bearer: String?, into id: UUID) async throws {
        for try await event in api.chat(request, bearer: bearer) {
            apply(event, to: id)
        }
    }

    // MARK: Profile and the account

    /// After sign-in: if the account has no profile yet, this device's becomes
    /// the account's; otherwise the account's replaces the copy here.
    func adoptAccountProfile(for user: AccountUser) async {
        guard let auth, let token = await auth.validAccessToken() else { return }
        do {
            let account = try await api.fetchAccountProfile(accessToken: token)
            // Only the first time this device's profile is taken over is it the
            // device's own, worth keeping to put back later.
            if defaults.string(forKey: Self.ownerKey) == nil {
                if isEmpty(profile) { defaults.removeObject(forKey: Self.backupKey) }
                else if let data = try? JSONEncoder().encode(profile) { defaults.set(data, forKey: Self.backupKey) }
            }
            defaults.set(user.id, forKey: Self.ownerKey)

            if account.version == 0 {
                guard !isEmpty(profile) else { return }
                let saved = try await api.saveAccountProfile(profile, baseVersion: 0, accessToken: token)
                setProfile(saved.profile)
            } else {
                setProfile(account.profile)
            }
        } catch {
            // Offline or unavailable: the copy here stays; sync runs again
            // next launch.
        }
    }

    /// Changed in the You tab. Signed in, the account is the profile, so the
    /// server sets it; signed out, the profile here goes with every message.
    /// False when it could not be saved.
    func changeExperience(_ value: String?) async -> Bool {
        if let auth, auth.user != nil {
            guard let token = await auth.validAccessToken() else { return false }
            do {
                setProfile(try await api.saveAccountExperience(value, accessToken: token).profile)
                return true
            } catch {
                return false
            }
        }
        var fields: [String: JSONValue] = [:]
        if case .object(let current) = profile { fields = current }
        fields["experience"] = value.map(JSONValue.string)
        setProfile(.object(fields))
        return true
    }

    /// After sign-out (by any route): the account's profile leaves this device,
    /// and the device's own pre-sign-in profile comes back.
    func handBackDevice() {
        guard defaults.string(forKey: Self.ownerKey) != nil else { return }
        let backup = defaults.data(forKey: Self.backupKey).flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) }
        setProfile(backup ?? .object([:]))
        defaults.removeObject(forKey: Self.ownerKey)
        defaults.removeObject(forKey: Self.backupKey)
    }

    private func setProfile(_ value: JSONValue) {
        profile = value
        if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: Self.profileKey) }
    }

    private func isEmpty(_ value: JSONValue) -> Bool {
        if case .object(let fields) = value { return fields.isEmpty }
        return value == .null
    }

    /// Starts a fresh conversation. The wellness profile is kept.
    func reset() {
        streamTask?.cancel()
        stopSpeaking?()
        items = []
        isStreaming = false
    }

    private func apply(_ event: ChatEvent, to id: UUID) {
        switch event {
        case .text(let delta): update(id) { $0.text += delta }
        case .card(let card): update(id) { $0.cards.append(card) }
        case .profile(let updated):
            setProfile(updated)
        case .error(let message):
            update(id) { item in
                item.failed = true
                if item.text.isEmpty { item.text = message }
            }
        case .done: break
        }
    }

    private func update(_ id: UUID, _ change: (inout ChatItem) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[index])
    }
}

extension ChatItem {
    struct Message { let role: String; let content: String }
}
