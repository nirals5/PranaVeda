import SwiftUI

/// The website's "Saved Rituals" card: bookmarked rituals, newest first, each
/// opening again. With a `limit`, only the newest few (the chat's welcome).
struct SavedRitualsView: View {
    let saved: SavedRitualStore
    var limit: Int? = nil
    @State private var opening: SavedRitual?

    var body: some View {
        let shown = limit.map { Array(saved.rituals.prefix($0)) } ?? saved.rituals
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Saved rituals").sectionLabel().accessibilityAddTraits(.isHeader)
                Spacer()
                Image(systemName: "bookmark").foregroundStyle(Theme.stone500).accessibilityHidden(true)
            }
            if shown.isEmpty {
                Text("No bookmarked rituals. Tap the bookmark on a ritual Amrita creates to keep it here.")
                    .font(Theme.bodySmall)
                    .foregroundStyle(Theme.stone700)
            } else {
                VStack(spacing: 0) {
                    ForEach(shown) { ritual in
                        row(ritual)
                        if ritual.id != shown.last?.id { Divider() }
                    }
                }
                if let limit, saved.rituals.count > limit {
                    Text("\(saved.rituals.count) saved · all of them are in the You tab")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.stone500)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .sheet(item: $opening) { RitualDetailView(result: $0.result) }
    }

    private func row(_ ritual: SavedRitual) -> some View {
        HStack(spacing: 12) {
            Button { opening = ritual } label: {
                HStack(spacing: 12) {
                    Image(systemName: "play.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.lavenderDeep)
                        .frame(width: 30, height: 30)
                        .background(Theme.lavenderTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ritual.title).font(Theme.itemTitle).foregroundStyle(Theme.ink).lineLimit(2)
                        Text([ritual.result.primaryEnergy, ritual.date].compactMap { $0 }.joined(separator: " · "))
                            .font(Theme.caption)
                            .foregroundStyle(Theme.stone500)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens this ritual")
            Button(role: .destructive) {
                withAnimation { saved.remove(ritual) }
            } label: {
                Image(systemName: "trash").font(.subheadline).frame(width: 36, height: 36)
            }
            .tint(Theme.stone500)
            .accessibilityLabel("Remove \(ritual.title) from saved rituals")
        }
        .padding(.vertical, 8)
    }
}

/// Saves or unsaves a ritual (the website's "Bookmark Ritual").
struct BookmarkButton: View {
    let result: RecommendationResult
    @Environment(SavedRitualStore.self) private var saved

    var body: some View {
        let isSaved = saved.isSaved(result)
        Button {
            let nowSaved = saved.toggle(result)
            AccessibilityNotification.Announcement(nowSaved ? "Ritual saved" : "Removed from saved rituals").post()
        } label: {
            Image(systemName: isSaved ? "bookmark.fill" : "bookmark")
                .contentTransition(.symbolEffect(.replace))
        }
        .tint(Theme.lavenderDeep)
        .accessibilityLabel(isSaved ? "Saved. Remove from saved rituals" : "Save ritual")
        .sensoryFeedback(.selection, trigger: isSaved)
    }
}
