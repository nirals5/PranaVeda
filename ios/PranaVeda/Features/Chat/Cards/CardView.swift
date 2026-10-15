import SwiftUI

struct CardView: View {
    let card: ChatCard
    let onOption: (String) -> Void

    var body: some View {
        switch card {
        case .ritual(let result): RitualCardView(result: result)
        case .breathwork(let note, let pattern): BreathworkCardView(note: note, pattern: pattern)
        case .doshaProfile(let profile): DoshaCardView(profile: profile)
        case .options(let options): OptionsView(options: options, onPick: onOption)
        case .unsupported: EmptyView()
        }
    }
}

struct RitualCardView: View {
    let result: RecommendationResult
    @State private var showingDetail = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Ritual").sectionLabel()
                Spacer()
                if let minutes = result.yogaPractice.durationMinutes {
                    Text("\(minutes) min").sectionLabel()
                }
            }
            Text(result.yogaPractice.title).font(Theme.heading(22)).foregroundStyle(Theme.ink)
            if let energy = result.primaryEnergy {
                Text(energy).font(Theme.bodySmall).italic().foregroundStyle(Theme.lavenderDeep)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(result.yogaPractice.poses) { pose in
                        PoseThumbnail(pose: pose)
                    }
                }
            }
            if let breath = result.breathwork {
                Label("\(breath.name) · \(breath.rhythm)", systemImage: "wind")
                    .font(Theme.bodySmall)
                    .foregroundStyle(Theme.stone700)
            }
            Button {
                showingDetail = true
            } label: {
                Text("Begin practice")
                    .font(Theme.label)
                    .tracking(0.9)
                    .textCase(.uppercase)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Theme.lavender, in: Capsule())
            }
        }
        .cardSurface()
        .sheet(isPresented: $showingDetail) { RitualDetailView(result: result) }
    }
}

struct PoseThumbnail: View {
    let pose: YogaPose

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            PoseImage(url: pose.imageURL)
                .frame(width: 150, height: 100)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            Text(pose.nameEnglish).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.ink).lineLimit(1)
            if let duration = pose.duration {
                Text(duration).font(.system(size: 11)).foregroundStyle(Theme.stone500)
            }
        }
        .frame(width: 150, alignment: .leading)
    }
}

/// A pose picture, or a quiet placeholder while it loads or if it cannot.
/// It fills whatever frame it is given and is cropped to it, so pictures of
/// any shape (Triangle's scene is 16:9) never spill out of their tile.
struct PoseImage: View {
    let url: URL?

    var body: some View {
        Color.clear
            .overlay {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFill()
                    case .failure: placeholder(symbol: "photo")
                    default: placeholder(symbol: nil)
                    }
                }
            }
            .clipped()
    }

    private func placeholder(symbol: String?) -> some View {
        ZStack {
            Theme.lavenderTint
            if let symbol { Image(systemName: symbol).foregroundStyle(Theme.lavender) }
        }
    }
}

struct RitualDetailView: View {
    let result: RecommendationResult
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let summary = result.summary {
                        Text(summary).font(Theme.body).foregroundStyle(Theme.stone700)
                    }
                    ForEach(Array(result.yogaPractice.poses.enumerated()), id: \.offset) { index, pose in
                        VStack(alignment: .leading, spacing: 10) {
                            PoseImage(url: pose.imageURL)
                                .frame(height: 200)
                                .frame(maxWidth: .infinity)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            Text("Posture \(index + 1)\(pose.duration.map { " · \($0)" } ?? "")").sectionLabel()
                            Text(pose.nameEnglish).font(Theme.heading()).foregroundStyle(Theme.ink)
                            if let sanskrit = pose.nameSanskrit {
                                Text(sanskrit).font(Theme.bodySmall).italic().foregroundStyle(Theme.lavenderDeep)
                            }
                            if let instructions = pose.instructions {
                                Text(instructions).font(Theme.bodySmall).foregroundStyle(Theme.stone700)
                            }
                        }
                        .cardSurface()
                    }
                    if let breath = result.breathwork {
                        BreathworkCardView(note: nil, pattern: breath)
                    }
                }
                .padding(16)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle(result.yogaPractice.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }
}

struct BreathworkCardView: View {
    let note: String?
    let pattern: BreathworkPattern

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Breathwork").sectionLabel()
            Text(pattern.name).font(Theme.heading()).foregroundStyle(Theme.ink)
            if let sanskrit = pattern.sanskritName {
                Text(sanskrit).font(Theme.bodySmall).italic().foregroundStyle(Theme.lavenderDeep)
            }
            Text("\(pattern.rhythm) · \(pattern.cycles) cycles").font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            if let note {
                Text(note).font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}

struct DoshaCardView: View {
    let profile: DoshaProfileCard

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your Prakriti").sectionLabel()
            Text([profile.primary, profile.secondary].compactMap { $0 }.joined(separator: "–"))
                .font(Theme.heading(24))
                .foregroundStyle(Theme.ink)
            bar("Vata", profile.balance.vata, Theme.lavender)
            bar("Pitta", profile.balance.pitta, Theme.terracotta)
            bar("Kapha", profile.balance.kapha, Color(hex: 0x6A9478))
            if let essence = profile.essence {
                Text(essence).font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            }
        }
        .cardSurface()
    }

    // Colour is never the only carrier of meaning: each bar is labelled.
    private func bar(_ name: String, _ percent: Double, _ color: Color) -> some View {
        HStack {
            Text(name).font(.system(size: 13)).frame(width: 52, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.stone200.opacity(0.4))
                    Capsule().fill(color.opacity(0.7)).frame(width: geo.size.width * percent / 100)
                }
            }
            .frame(height: 8)
            Text("\(Int(percent))%").font(.system(size: 12, design: .monospaced)).frame(width: 40, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

struct OptionsView: View {
    let options: [AnswerOption]
    let onPick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(options, id: \.label) { option in
                Button {
                    onPick(option.label)
                } label: {
                    HStack(spacing: 10) {
                        if let emoji = option.emoji { Text(emoji) }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.label).font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.ink)
                            if let description = option.description {
                                Text(description).font(.system(size: 12)).foregroundStyle(Theme.stone500)
                            }
                        }
                        Spacer()
                    }
                    .padding(12)
                    .background(.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.lavenderTint))
                }
            }
        }
    }
}
