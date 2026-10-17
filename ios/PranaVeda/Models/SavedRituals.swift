import Foundation
import Observation

/// A bookmarked ritual, in the website's shape (SavedPractice in
/// src/types.ts). Like the website's, the list stays on this device: it is
/// not part of the account.
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

/// The saved rituals on this phone, newest first.
@MainActor
@Observable
final class SavedRitualStore {
    private(set) var rituals: [SavedRitual]
    private let fileURL: URL

    init(fileURL: URL = SavedRitualStore.defaultFileURL) {
        self.fileURL = fileURL
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
            store(rituals.filter { $0.result != result })
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
        return true
    }

    func remove(_ ritual: SavedRitual) {
        store(rituals.filter { $0.id != ritual.id })
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
