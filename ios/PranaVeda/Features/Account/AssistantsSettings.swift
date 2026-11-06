import AppIntents
import SwiftUI

/// What the Smart assistants card shows. Siri's phrases are the app's own
/// (PranaVedaShortcuts); Alexa comes from the server, and only once the skill
/// is published (GET /api/assistants), so it appears without a new release.
struct Assistants: Decodable, Sendable {
    struct Alexa: Decodable, Sendable {
        let url: URL
        let phrases: [String]
    }

    let alexa: Alexa?

    /// A few of the phrases Siri knows, with one of their saved rituals by
    /// name when they have one.
    static func siriPhrases(ritual: String?) -> [String] {
        [
            "Talk to Amrita",
            ritual.map { "Start \($0) in PranaVeda" } ?? "Start my practice in PranaVeda",
            "How's my PranaVeda streak",
        ]
    }
}

extension APIClient {
    func assistants() async throws -> Assistants {
        let (data, response) = try await session.data(from: baseURL.appending(path: "api/assistants"))
        if let http = response as? HTTPURLResponse, http.statusCode != 200 { throw APIError.http(http.statusCode) }
        return try JSONDecoder().decode(Assistants.self, from: data)
    }
}

/// Which smart assistants reach PranaVeda, what to say to each and how to set
/// it up. Nothing here is linked to the account yet.
struct AssistantsSettings: View {
    let saved: SavedRitualStore
    @State private var alexa: Assistants.Alexa?
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Smart assistants").sectionLabel().accessibilityAddTraits(.isHeader)
            Text("Practise without opening the app").font(Theme.heading()).foregroundStyle(Theme.ink)
            Text("Siri knows PranaVeda as soon as it is installed: ask it to start a practice, talk to Amrita or check your streak.")
                .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            assistant("Siri", phrases: Assistants.siriPhrases(ritual: saved.rituals.first?.title)) {
                // Opens PranaVeda's actions in the Shortcuts app.
                ShortcutsLink().shortcutsLinkStyle(.automaticOutline)
            }
            if let alexa {
                Divider().overlay(Theme.stone200)
                assistant("Alexa", phrases: alexa.phrases) {
                    Button("Enable in the Alexa app") { openURL(alexa.url) }
                        .buttonStyle(PillButton(primary: false))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .task { alexa = try? await APIClient().assistants().alexa }
    }

    private func assistant(_ name: String, phrases: [String], @ViewBuilder action: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(name).font(Theme.body.weight(.semibold)).foregroundStyle(Theme.ink)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(phrases, id: \.self) { phrase in
                    Text("“\(phrase)”").font(Theme.quote.italic()).foregroundStyle(Theme.stone700)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Say to \(name): " + phrases.joined(separator: ". "))
            action()
        }
    }
}
