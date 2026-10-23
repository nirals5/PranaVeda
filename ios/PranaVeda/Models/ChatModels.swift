import Foundation

// Shapes of the cards Amrita sends in the chat stream (see ChatCard in the
// web app's src/types.ts). Most fields are written by the model, so decoding
// is lenient: a missing optional field must not lose the whole card.

struct BreathworkPattern: Codable, Hashable, Sendable {
    let name: String
    let sanskritName: String?
    let description: String?
    let inhale: Double
    let holdActive: Double
    let exhale: Double
    let holdEmpty: Double
    let cycles: Int
    let benefits: String?
    /// How to adapt it for one of the user's conditions (G13); the server
    /// adds it only when it applies.
    var caution: String? = nil

    /// "In 4 · hold 4 · out 4 · rest 4"
    var rhythm: String {
        func s(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(v) }
        var parts = ["In \(s(inhale))"]
        if holdActive > 0 { parts.append("hold \(s(holdActive))") }
        parts.append("out \(s(exhale))")
        if holdEmpty > 0 { parts.append("rest \(s(holdEmpty))") }
        return parts.joined(separator: " · ")
    }
}

struct YogaPose: Codable, Hashable, Sendable, Identifiable {
    let poseId: String?
    let nameEnglish: String
    let nameSanskrit: String?
    let duration: String?
    let benefits: String?
    let instructions: String?
    let poseImageUrl: String?
    let sceneImageUrl: String?
    let videoUrl: String?
    /// How to adapt it for one of the user's conditions (G13); the server
    /// adds it only when it applies.
    var caution: String? = nil

    var id: String { (poseId ?? "") + nameEnglish }
    /// Niral's room scene when the pose has one, else the flat photo.
    var imageURL: URL? { AppConfig.resolve(sceneImageUrl ?? poseImageUrl) }
}

struct YogaPractice: Codable, Hashable, Sendable {
    let title: String
    let description: String?
    let poses: [YogaPose]
    let durationMinutes: Int?
}

struct AyurvedicAdvice: Codable, Hashable, Sendable {
    let assessment: String?
    let doshaPrimary: String?
    let dietaryTips: [String]?
    let lifestyleTips: [String]?
    let recommendedHerbs: [String]?
}

struct RecommendationResult: Codable, Hashable, Sendable {
    let summary: String?
    let doshaTendency: String?
    let primaryEnergy: String?
    let yogaPractice: YogaPractice
    let ayurvedicAdvice: AyurvedicAdvice?
    let breathwork: BreathworkPattern?
    let lifestyleTips: [String]?
}

struct AnswerOption: Codable, Hashable, Sendable {
    let label: String
    let emoji: String?
    let description: String?
}

struct DoshaBalance: Codable, Hashable, Sendable {
    let vata: Double
    let pitta: Double
    let kapha: Double
}

struct DoshaProfileCard: Codable, Hashable, Sendable {
    let primary: String
    let secondary: String?
    let balance: DoshaBalance
    let essence: String?
    let explanation: String?
    let guidance: [String]?
    let confidence: String?
}

enum ChatCard: Decodable, Hashable, Sendable {
    case ritual(RecommendationResult)
    case breathwork(note: String?, pattern: BreathworkPattern)
    case doshaProfile(DoshaProfileCard)
    case options([AnswerOption])
    /// A card kind this version of the app does not know. Shown as nothing.
    case unsupported(String)

    private enum Keys: String, CodingKey { case kind, result, note, pattern, options }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "ritual": self = .ritual(try c.decode(RecommendationResult.self, forKey: .result))
        case "breathwork":
            self = .breathwork(note: try c.decodeIfPresent(String.self, forKey: .note), pattern: try c.decode(BreathworkPattern.self, forKey: .pattern))
        case "dosha_profile": self = .doshaProfile(try DoshaProfileCard(from: decoder))
        case "options": self = .options(try c.decode([AnswerOption].self, forKey: .options))
        default: self = .unsupported(kind)
        }
    }

    /// How the card is described to Amrita in later turns (matches the web app).
    var modelMarker: String {
        switch self {
        case .ritual(let r): r.yogaPractice.title
        case .breathwork(_, let p): p.name
        case .doshaProfile(let d): "Prakriti profile (\(d.primary))"
        case .options(let o): "answer options: " + o.map(\.label).joined(separator: " / ")
        case .unsupported(let kind): kind
        }
    }
}

struct ChatItem: Identifiable, Hashable, Sendable {
    enum Role: String, Sendable { case user, assistant }
    let id: UUID
    let role: Role
    var text: String
    var cards: [ChatCard]
    var streaming: Bool
    var failed: Bool

    init(role: Role, text: String = "", cards: [ChatCard] = [], streaming: Bool = false) {
        self.id = UUID()
        self.role = role
        self.text = text
        self.cards = cards
        self.streaming = streaming
        self.failed = false
    }

    /// The text Amrita sees for this turn: card-only turns become a marker,
    /// so she remembers what she presented.
    var modelContent: String {
        if !text.isEmpty { return text }
        guard !cards.isEmpty else { return "" }
        return "[Presented: " + cards.map(\.modelMarker).joined(separator: ", ") + "]"
    }
}
