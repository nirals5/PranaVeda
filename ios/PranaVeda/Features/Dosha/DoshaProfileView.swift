import SwiftUI

/// The person's Prakriti, as Amrita assessed it, with the classical balancing
/// reference for it (the website's Dosha Profile screen). Without an
/// assessment yet, it invites the discovery conversation.
struct DoshaProfileView: View {
    let profile: JSONValue
    let guide: DoshaGuideStore
    /// Asks Amrita (switching to the chat) with this message.
    let askAmrita: (String) -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                ScrollView {
                    if let dosha = SavedDoshaProfile(profile: profile) {
                        assessed(dosha).padding(16)
                    } else {
                        invitation.padding(24)
                    }
                }
            }
            .navigationTitle("Dosha")
            .task { await guide.loadIfNeeded() }
        }
    }

    private var prakriti: String? { profile["prakriti"]?.stringValue }

    private var discoveryMessage: String {
        prakriti != nil ? "I'd like to revisit my dosha profile with you" : "Help me discover my dosha profile"
    }

    // MARK: No assessment yet

    private var invitation: some View {
        VStack(spacing: 18) {
            HStack(spacing: 6) {
                ForEach(DoshaStyle.all, id: \.name) { style in
                    Image(systemName: style.symbol).foregroundStyle(style.ink.opacity(0.7))
                }
            }
            .font(.title3)
            .frame(width: 96, height: 96)
            .background(.white.opacity(0.7), in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.9)))
            .shadow(color: Theme.lavender.opacity(0.15), radius: 16, y: 8)
            .accessibilityHidden(true)

            Text(prakriti != nil ? "Complete your dosha portrait" : "Discover your constitution")
                .font(Theme.heading(.title))
                .italic()
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)

            Text(prakriti.map {
                "Amrita has noted your constitution as \($0), but a short conversation will complete the full portrait — your elemental balance, its meaning, and how to keep it in harmony."
            } ?? "In Ayurveda, your Prakriti is the unique balance of Vata, Pitta, and Kapha you were born with. A short conversation with Amrita — no quiz, just a few thoughtful questions — reveals yours and shapes every recommendation she makes.")
                .font(Theme.body)
                .foregroundStyle(Theme.stone700)
                .multilineTextAlignment(.center)

            Button { askAmrita(discoveryMessage) } label: {
                Label("Begin discovery with Amrita", systemImage: "arrow.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .labelFont()
                    .tracking(0.9)
                    .textCase(.uppercase)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 12)
                    .background(Theme.lavender, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 32)
    }

    // MARK: Assessed

    private func assessed(_ dosha: SavedDoshaProfile) -> some View {
        let reference = guide.guide?.doshas[dosha.primary]
        let secondaryReference = dosha.secondary.flatMap { guide.guide?.doshas[$0] }

        return VStack(alignment: .leading, spacing: 18) {
            header(dosha, tagline: reference?.tagline)

            if let guidance = dosha.guidance, !guidance.isEmpty {
                section("Amrita's guidance for you", symbol: "sparkles") { bullets(guidance) }
            }

            if let reference {
                section("Understanding \(dosha.primary)", symbol: DoshaStyle.named(dosha.primary).symbol) {
                    VStack(alignment: .leading, spacing: 10) {
                        labelled("Qualities", reference.qualities)
                        labelled("Thrown off by", reference.aggravatedBy)
                        labelled("Balanced by", reference.balancedBy)
                        if let secondary = dosha.secondary, let secondaryReference {
                            Divider()
                            Text("Your secondary \(secondary) adds: \(secondaryReference.tagline.lowercased()). When \(dosha.primary) feels settled but something still stirs, tend the \(secondary).")
                                .font(Theme.bodySmall)
                                .foregroundStyle(Theme.stone700)
                        }
                    }
                }
                section("Nourishment (Ahara)", symbol: "fork.knife") { bullets(reference.diet) }
                section("Daily rhythm (Dinacharya)", symbol: "sun.max") { bullets(reference.lifestyle + [reference.rhythm]) }
                section("Practice & breath", symbol: "moon") {
                    VStack(alignment: .leading, spacing: 10) {
                        labelled("Movement", reference.practiceStyle)
                        labelled("Breath", reference.breath)
                        Label(reference.season, systemImage: "leaf")
                            .font(Theme.bodySmall)
                            .foregroundStyle(Theme.stone700)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 12) {
                if let note = guide.guide?.note {
                    Text(note).font(Theme.caption).italic().foregroundStyle(Theme.stone500)
                }
                Button { askAmrita(discoveryMessage) } label: {
                    Label("Revisit with Amrita", systemImage: "arrow.clockwise")
                        .labelFont()
                        .tracking(0.9)
                        .textCase(.uppercase)
                        .foregroundStyle(Theme.stone700)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(.white.opacity(0.6), in: Capsule())
                        .overlay(Capsule().stroke(.white.opacity(0.8)))
                }
            }
            .padding(.top, 4)
        }
    }

    private func header(_ dosha: SavedDoshaProfile, tagline: String?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Your Prakriti", systemImage: "sparkles")
                .labelFont()
                .tracking(0.9)
                .textCase(.uppercase)
                .foregroundStyle(Theme.stone700)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Theme.lavenderTint, in: Capsule())
            (Text(dosha.primary).foregroundStyle(Theme.ink)
                + Text(dosha.secondary.map { " · \($0)" } ?? "").foregroundStyle(Theme.stone500))
                .font(Theme.display)
            if let tagline {
                Text(tagline).font(Theme.bodySmall).foregroundStyle(Theme.stone500)
            }
            if let essence = dosha.essence {
                Text("“\(essence)”").font(Theme.heading(.body)).italic().foregroundStyle(Theme.stone700)
            }
            VStack(spacing: 10) {
                BalanceBar(style: .vata, percent: dosha.balance.vata)
                BalanceBar(style: .pitta, percent: dosha.balance.pitta)
                BalanceBar(style: .kapha, percent: dosha.balance.kapha)
            }
            .padding(.top, 4)
            if let line = Self.confidenceLine(confidence: dosha.confidence, assessedDate: dosha.assessedDate) {
                Text(line).sectionLabel().frame(maxWidth: .infinity, alignment: .trailing)
            }
            if let explanation = dosha.explanation {
                Divider()
                Text(explanation).font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    /// "medium confidence · 2026-10-12", as on the website.
    nonisolated static func confidenceLine(confidence: String?, assessedDate: String?) -> String? {
        guard let confidence else { return assessedDate }
        return "\(confidence) confidence" + (assessedDate.map { " · \($0)" } ?? "")
    }

    private func section<Content: View>(_ title: String, symbol: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: symbol)
                .labelFont()
                .tracking(0.9)
                .textCase(.uppercase)
                .foregroundStyle(Theme.stone500)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func bullets(_ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("·").foregroundStyle(Theme.lavender)
                    Text(item).foregroundStyle(Theme.ink)
                }
                .font(Theme.bodySmall)
            }
        }
    }

    private func labelled(_ label: String, _ text: String) -> some View {
        (Text("\(label): ").fontWeight(.semibold).foregroundStyle(Theme.ink) + Text(text).foregroundStyle(Theme.stone700))
            .font(Theme.bodySmall)
    }
}

/// Each dosha's look on the website: a symbol, a soft bar and a darker ink.
struct DoshaStyle: Hashable {
    let name: String
    let symbol: String
    let bar: Color
    let tint: Color
    let ink: Color

    static let vata = DoshaStyle(name: "Vata", symbol: "wind", bar: Color(hex: 0xB7CFFB), tint: Theme.blueTint, ink: Color(hex: 0x3B5B95))
    static let pitta = DoshaStyle(name: "Pitta", symbol: "flame", bar: Color(hex: 0xF2D0C6), tint: Theme.peachTint, ink: Color(hex: 0x7E4F41))
    static let kapha = DoshaStyle(name: "Kapha", symbol: "drop", bar: Color(hex: 0xA2E6D4), tint: Theme.mintTint, ink: Color(hex: 0x2D5A4E))
    static let all = [vata, pitta, kapha]

    static func named(_ name: String) -> DoshaStyle { all.first { $0.name == name } ?? vata }
}

/// One dosha's share. Colour is never the only carrier of meaning: each bar is
/// labelled with its name and percentage.
private struct BalanceBar: View {
    let style: DoshaStyle
    let percent: Double

    var body: some View {
        HStack(spacing: 10) {
            Label(style.name, systemImage: style.symbol)
                .labelFont()
                .textCase(.uppercase)
                .foregroundStyle(style.ink)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(style.tint, in: Capsule())
                .fixedSize()
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.7))
                    Capsule().fill(style.bar).frame(width: geo.size.width * min(max(percent, 0), 100) / 100)
                }
            }
            .frame(height: 8)
            Text("\(Int(percent.rounded()))%").font(Theme.caption.monospacedDigit()).foregroundStyle(Theme.stone700).fixedSize()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(style.name) \(Int(percent.rounded())) percent")
    }
}
