import Foundation
import Observation

/// The conversation with Amrita, as a guest: the wellness profile lives on
/// this device and travels with each message, as in the signed-out web app.
@MainActor
@Observable
final class ChatViewModel {
    private(set) var items: [ChatItem] = []
    private(set) var isStreaming = false
    private(set) var profile: JSONValue

    private let api: APIClient
    private let defaults: UserDefaults
    private var streamTask: Task<Void, Never>?

    private static let profileKey = "pranaveda_profile"

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

    /// The device's calendar day as "YYYY-MM-DD", in whatever timezone it is
    /// in right now.
    private static func localDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isStreaming else { return }

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
            previousSession: nil
        )

        streamTask = Task { [weak self] in
            guard let self else { return }
            do {
                for try await event in api.chat(request) {
                    apply(event, to: reply.id)
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
        }
    }

    /// Starts a fresh conversation. The wellness profile is kept.
    func reset() {
        streamTask?.cancel()
        items = []
        isStreaming = false
    }

    private func apply(_ event: ChatEvent, to id: UUID) {
        switch event {
        case .text(let delta): update(id) { $0.text += delta }
        case .card(let card): update(id) { $0.cards.append(card) }
        case .profile(let updated):
            profile = updated
            if let data = try? JSONEncoder().encode(updated) { defaults.set(data, forKey: Self.profileKey) }
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
