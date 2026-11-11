import AppIntents
import CoreSpotlight
import Foundation

// What Siri, Shortcuts and Spotlight can find and do in PranaVeda (KAN-21).
// Entities and intents read the saved rituals and the practice log straight
// from their files, so they work whether or not the app's screens are open.
// Nothing from Health goes into them.
//
// Property titles say what the value is and its format: the descriptions the
// new Siri reads need iOS 27.3 as the app's minimum, and titles work from 17.

/// A saved ritual: "Hey Siri, start my evening flow in PranaVeda".
struct SavedRitualEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Saved Ritual" }
    static var defaultQuery: SavedRitualQuery { SavedRitualQuery() }

    let id: String
    @Property(title: "Ritual Name")
    var title: String
    @Property(title: "Date Saved (YYYY-MM-DD)")
    var savedOn: String
    @Property(title: "Length in Minutes")
    var minutes: Int?
    @Property(title: "Yoga Poses in Order")
    var poses: [String]
    @Property(title: "What the Practice Is For")
    var about: String?

    init(_ ritual: SavedRitual) {
        id = ritual.id
        title = ritual.title
        savedOn = ritual.date
        minutes = ritual.result.yogaPractice.durationMinutes
        poses = ritual.result.yogaPractice.poses.map(\.nameEnglish)
        about = ritual.result.yogaPractice.description ?? ritual.result.summary
    }

    var displayRepresentation: DisplayRepresentation {
        let subtitle = [minutes.map { "\($0) min" }, "saved \(savedOn)"].compactMap { $0 }.joined(separator: " · ")
        return DisplayRepresentation(title: "\(title)", subtitle: "\(subtitle)", image: .init(systemName: "figure.yoga"))
    }

    /// The saved rituals on this phone, newest first.
    static func saved(fileURL: URL = SavedRitualStore.defaultFileURL) -> [SavedRitual] {
        (try? Data(contentsOf: fileURL)).flatMap { try? JSONDecoder().decode([SavedRitual].self, from: $0) } ?? []
    }

    /// Rituals whose title or poses share a word with what was said, best
    /// match first. "Ritual", "practice" and the like say nothing about which.
    static func matching(_ said: String, in rituals: [SavedRitual]) -> [SavedRitual] {
        let wanted = words(said).subtracting(["my", "the", "a", "ritual", "practice", "flow", "sequence", "routine", "yoga"])
        guard !wanted.isEmpty else { return [] }
        // Spelled out step by step: as one chain it is too slow to type-check.
        var scored: [(index: Int, ritual: SavedRitual, score: Int)] = []
        for (index, ritual) in rituals.enumerated() {
            let names: [String] = [ritual.title] + ritual.result.yogaPractice.poses.map(\.nameEnglish)
            let score = wanted.intersection(words(names.joined(separator: " "))).count
            if score > 0 { scored.append((index, ritual, score)) }
        }
        scored.sort { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
        return scored.map(\.ritual)
    }

    private static func words(_ text: String) -> Set<String> {
        Set(text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init))
    }
}

struct SavedRitualQuery: EntityStringQuery, EnumerableEntityQuery {
    func entities(for identifiers: [String]) async throws -> [SavedRitualEntity] {
        let rituals = SavedRitualEntity.saved()
        return identifiers.compactMap { id in rituals.first { $0.id == id }.map(SavedRitualEntity.init) }
    }

    func entities(matching string: String) async throws -> [SavedRitualEntity] {
        SavedRitualEntity.matching(string, in: SavedRitualEntity.saved()).map(SavedRitualEntity.init)
    }

    func allEntities() async throws -> [SavedRitualEntity] {
        SavedRitualEntity.saved().map(SavedRitualEntity.init)
    }

    func suggestedEntities() async throws -> [SavedRitualEntity] {
        SavedRitualEntity.saved().prefix(10).map(SavedRitualEntity.init)
    }
}

@available(iOS 18.0, *)
extension SavedRitualEntity: IndexedEntity {}

/// Begins a saved ritual's guided practice: the one named, or the newest.
/// Opens the Library when nothing is saved yet. Runs in the app.
struct StartPracticeIntent: AppIntent {
    static let title: LocalizedStringResource = "Start My Practice"
    static let description = IntentDescription("Begins a saved ritual's guided practice, pose by pose. Without a ritual, the one saved most recently.")
    static let openAppWhenRun = true

    @Parameter(title: "Ritual", description: "The saved ritual to practise. Leave it empty for the one saved most recently.")
    var ritual: SavedRitualEntity?

    init() {}

    init(ritual: SavedRitualEntity?) {
        self.ritual = ritual
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Start \(\.$ritual)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        AppLinkRouter.shared.pending = ritual.map { WidgetLink.practice($0.id) } ?? WidgetLink.practice
        return .result()
    }
}

/// Opens the chat with a question asked, as if typed.
struct AskAmritaIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask Amrita"
    static let description = IntentDescription("Asks Amrita, PranaVeda's Ayurvedic guide, a question, and opens the chat for her answer.")
    static let openAppWhenRun = true

    @Parameter(title: "Question", description: "What to ask Amrita, in your own words.", requestValueDialog: "What would you like to ask Amrita?")
    var question: String

    @MainActor
    func perform() async throws -> some IntentResult {
        AppLinkRouter.shared.question = question
        return .result()
    }
}

/// The streak and this week's practice, answered without opening the app.
struct PracticeSummaryIntent: AppIntent {
    static let title: LocalizedStringResource = "Practice Summary"
    static let description = IntentDescription("Tells you your current practice streak and how much you've practised this week.")

    func perform() async throws -> some IntentResult & ReturnsValue<PracticeSummaryEntity> & ProvidesDialog {
        let summary = PracticeSummaryEntity(PracticeTrends(entries: PracticeStore.savedEntries()))
        return .result(value: summary, dialog: "\(summary.summary)")
    }

    static func summary(_ trends: PracticeTrends) -> String {
        if trends.isEmpty { return "You haven't logged a practice yet. Say “Start my practice in PranaVeda” when you're ready." }
        let streak = switch trends.currentStreak {
        case 0: "Your next practice starts a new streak."
        case 1: "You're on a 1-day streak."
        case let days: "You're on a \(days)-day streak."
        }
        let week = trends.thisWeek
        let thisWeek = week.practices == 0
            ? "Nothing logged this week yet."
            : "This week: \(week.practices) \(week.practices == 1 ? "practice" : "practices"), \(week.minutes) minutes."
        return "\(streak) \(thisWeek)"
    }
}

/// What Practice Summary answers with: the sentence, and its numbers for
/// Siri to read or show. Made fresh for each answer, never stored.
struct PracticeSummaryEntity: TransientAppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Practice Summary" }

    @Property(title: "Current Streak in Days")
    var streakDays: Int
    @Property(title: "Practices Logged This Week")
    var practicesThisWeek: Int
    @Property(title: "Minutes Practised This Week")
    var minutesThisWeek: Int
    @Property(title: "Summary to Read Out")
    var summary: String

    init() {
        streakDays = 0
        practicesThisWeek = 0
        minutesThisWeek = 0
        summary = ""
    }

    init(_ trends: PracticeTrends) {
        streakDays = trends.currentStreak
        practicesThisWeek = trends.thisWeek.practices
        minutesThisWeek = trends.thisWeek.minutes
        summary = PracticeSummaryIntent.summary(trends)
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(streakDays)-day streak", subtitle: "\(practicesThisWeek) this week · \(minutesThisWeek) min", image: .init(systemName: "flame"))
    }
}

enum SiriBridge {
    /// Keeps Spotlight, and with it Siri, in step with the saved rituals, and
    /// the "Start <ritual>" phrases with their titles.
    static func ritualsChanged(_ rituals: [SavedRitual]) {
        if #available(iOS 18.0, *) {
            let entities = rituals.map(SavedRitualEntity.init)
            Task {
                let index = CSSearchableIndex.default()
                try? await index.deleteAppEntities(ofType: SavedRitualEntity.self)
                try? await index.indexAppEntities(entities)
            }
        }
        PranaVedaShortcuts.updateAppShortcutParameters()
    }

    /// Tells Siri a saved ritual's practice began here, so it learns what
    /// "my practice" usually means.
    static func practiceBegan(_ result: RecommendationResult) {
        guard let ritual = SavedRitualEntity.saved().first(where: { $0.result == result }) else { return }
        Task { _ = try? await IntentDonationManager.shared.donate(intent: StartPracticeIntent(ritual: SavedRitualEntity(ritual))) }
    }
}

#if SIRI_AI
// Siri AI (KAN-21): these are the tools the new Siri may call. Written as
// conformances, not @AppIntent(.tool): the macro needs iOS 27.3 as the app's
// minimum, and this keeps it at 17.
@available(iOS 27.3, *)
extension StartPracticeIntent: ToolIntent {}
@available(iOS 27.3, *)
extension AskAmritaIntent: ToolIntent {}
@available(iOS 27.3, *)
extension PracticeSummaryIntent: ToolIntent {}
#endif
