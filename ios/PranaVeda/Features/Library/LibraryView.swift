import SwiftUI

/// The practice catalog from /api/catalog: every pose Amrita can draw on.
struct LibraryView: View {
    let catalog: CatalogStore
    /// From their profile, so an Explore pose can say it is not for them.
    var conditions: [String] = []

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                if let poses = catalog.catalog?.poses {
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14, alignment: .top)], spacing: 18) {
                            ForEach(poses) { pose in
                                NavigationLink(value: pose) { tile(pose) }.buttonStyle(.plain)
                            }
                        }
                        .padding(16)
                        if let explore = catalog.catalog?.explore, !explore.isEmpty {
                            exploreSection(explore)
                        }
                    }
                    .navigationDestination(for: CatalogPose.self) { PoseDetailView(pose: $0) }
                    .navigationDestination(for: ExplorePose.self) { ExploreDetailView(pose: $0, notFor: $0.notFor(conditions)) }
                } else if let error = catalog.loadError {
                    VStack(spacing: 12) {
                        Text(error).font(Theme.body).multilineTextAlignment(.center).foregroundStyle(Theme.stone700)
                        Button("Try again") { Task { await catalog.load() } }
                    }
                    .padding(32)
                } else {
                    ProgressView().tint(Theme.lavender)
                }
            }
            .navigationTitle("Library")
        }
    }

    /// G3: the advanced poses Amrita never offers, after the library.
    private func exploreSection(_ poses: [ExplorePose]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Explore").font(Theme.heading(.title2)).foregroundStyle(Theme.ink)
                Text("Advanced poses, at your own risk. Amrita won't suggest these.")
                    .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14, alignment: .top)], spacing: 18) {
                ForEach(poses) { pose in
                    NavigationLink(value: pose) {
                        VStack(alignment: .leading, spacing: 6) {
                            ExplorePlaceholder().frame(height: 110)
                            Text(pose.nameEnglish).font(Theme.itemTitle).foregroundStyle(Theme.ink).lineLimit(2)
                            if !pose.notFor(conditions).isEmpty {
                                Text("Not for you").labelFont().tracking(0.9).textCase(.uppercase).foregroundStyle(Theme.terracotta)
                            } else {
                                ExperiencedOnlyLabel()
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
    }

    private func tile(_ pose: CatalogPose) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            PoseImage(url: pose.imageURL)
                .frame(height: 110)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            Text(pose.nameEnglish).font(Theme.itemTitle).foregroundStyle(Theme.ink).lineLimit(2)
            Text(pose.level).sectionLabel()
            if pose.experiencedOnly { ExperiencedOnlyLabel() }
        }
    }
}

struct PoseDetailView: View {
    let pose: CatalogPose

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PoseImage(url: pose.imageURL)
                    .frame(height: 240)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text(pose.nameSanskrit).font(Theme.bodySmall).italic().foregroundStyle(Theme.lavenderDeep)
                Text("\(pose.level) · \(pose.bodyFocus)").sectionLabel()
                if pose.experiencedOnly { ExperiencedOnlyLabel() }
                Text(pose.benefits).font(Theme.body).foregroundStyle(Theme.stone700)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Cues").sectionLabel()
                    ForEach(pose.cues, id: \.self) { cue in
                        Label(cue, systemImage: "circle.fill")
                            .labelStyle(BulletLabelStyle())
                            .font(Theme.bodySmall)
                            .foregroundStyle(Theme.ink)
                    }
                }
                .cardSurface()
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle(pose.nameEnglish)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One explore-only pose: the caveat first, then how it is done. No guided
/// practice and no logging.
struct ExploreDetailView: View {
    let pose: ExplorePose
    /// The conditions on their profile it must be avoided with.
    let notFor: [String]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ExplorePlaceholder().frame(height: 180)
                Text(pose.nameSanskrit).font(Theme.bodySmall).italic().foregroundStyle(Theme.lavenderDeep)
                Text(pose.bodyFocus).sectionLabel()
                ExperiencedOnlyLabel()
                VStack(alignment: .leading, spacing: 6) {
                    Text("At your own risk").sectionLabel()
                    Text("Amrita won't suggest this pose. It is best learned with a teacher. Practise it only if you are experienced, and stop if anything hurts.")
                        .font(Theme.bodySmall).foregroundStyle(Theme.ink)
                    if !notFor.isEmpty {
                        Text("Not for you: you've said \(notFor.joined(separator: ", ").lowercased()).")
                            .font(Theme.bodySmall.weight(.semibold)).foregroundStyle(Theme.terracotta)
                    }
                    if !pose.avoidWith.isEmpty {
                        Text("Avoid with: \(pose.avoidWith.map(\.label).joined(separator: ", ").lowercased()).")
                            .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
                    }
                    if pose.avoidAfterMeal == true {
                        Text("Not within 2 hours of a meal.").font(Theme.bodySmall).foregroundStyle(Theme.stone700)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.terracotta.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.terracotta.opacity(0.35)))
                Text(pose.benefits).font(Theme.body).foregroundStyle(Theme.stone700)
                list("Cues", pose.cues)
                list("Common mistakes", pose.commonMistakes)
                if !pose.modifications.isEmpty || pose.followWith != nil {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Build up to it").sectionLabel()
                        if !pose.modifications.isEmpty {
                            Text(pose.modifications).font(Theme.bodySmall).foregroundStyle(Theme.ink)
                        }
                        if let follow = pose.followWith {
                            Text("Follow with \(follow).").font(Theme.bodySmall).foregroundStyle(Theme.ink)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface()
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle(pose.nameEnglish)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func list(_ title: String, _ items: [String]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).sectionLabel()
                ForEach(items, id: \.self) { item in
                    Label(item, systemImage: "circle.fill")
                        .labelStyle(BulletLabelStyle())
                        .font(Theme.bodySmall)
                        .foregroundStyle(Theme.ink)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface()
        }
    }
}

/// Explore poses have no photographs yet.
private struct ExplorePlaceholder: View {
    var body: some View {
        ZStack {
            Theme.lavenderTint
            Image(systemName: "figure.yoga").font(.system(size: 34)).foregroundStyle(Theme.lavender)
        }
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// The practices Amrita offers only to experienced practitioners (G2).
private struct ExperiencedOnlyLabel: View {
    var body: some View {
        Text("For experienced practitioners").labelFont().tracking(0.9).textCase(.uppercase).foregroundStyle(Theme.terracotta)
    }
}

private struct BulletLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon.font(.system(size: 5)).foregroundStyle(Theme.lavender)
            configuration.title
        }
    }
}
