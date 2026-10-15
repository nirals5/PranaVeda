import SwiftUI

/// The practice catalog from /api/catalog: every pose Amrita can draw on.
struct LibraryView: View {
    let catalog: CatalogStore

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                if let poses = catalog.catalog?.poses {
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14)], spacing: 18) {
                            ForEach(poses) { pose in
                                NavigationLink(value: pose) { tile(pose) }.buttonStyle(.plain)
                            }
                        }
                        .padding(16)
                    }
                    .navigationDestination(for: CatalogPose.self) { PoseDetailView(pose: $0) }
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

    private func tile(_ pose: CatalogPose) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            PoseImage(url: pose.imageURL)
                .frame(height: 110)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            Text(pose.nameEnglish).font(Theme.itemTitle).foregroundStyle(Theme.ink).lineLimit(2)
            Text(pose.level).sectionLabel()
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

private struct BulletLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon.font(.system(size: 5)).foregroundStyle(Theme.lavender)
            configuration.title
        }
    }
}
