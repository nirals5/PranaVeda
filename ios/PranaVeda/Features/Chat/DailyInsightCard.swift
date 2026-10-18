import SwiftUI

/// The website's "Daily Insight" card, under the greeting before a
/// conversation starts.
struct DailyInsightCard: View {
    let state: DailyInsightStore.State

    /// What the website shows when no reflection can be loaded.
    static let offlineHeadline = "Vata season transitions"
    static let offlineQuote = "Prana is the bridge between the body and mind. Let your breath serve as the anchor of absolute consciousness."

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Daily insight").sectionLabel().accessibilityAddTraits(.isHeader)
                Spacer()
                Image(systemName: "safari").foregroundStyle(Theme.stone500).accessibilityHidden(true)
            }
            switch state {
            case .loading:
                placeholder
            case .loaded(let insight):
                reflection(insight)
            case .unavailable:
                Text(Self.offlineHeadline).font(Theme.heading()).foregroundStyle(Theme.ink)
                quote(Self.offlineQuote)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .animation(.easeOut(duration: 0.25), value: state)
    }

    private func reflection(_ insight: DailyInsight) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(insight.headline).font(Theme.heading()).foregroundStyle(Theme.ink)
            quote(insight.quote)
            Divider().overlay(Theme.stone200.opacity(0.5))
            VStack(alignment: .leading, spacing: 6) {
                Text(insight.focus)
                    .labelFont().tracking(1.2).textCase(.uppercase)
                    .foregroundStyle(Theme.lavender)
                Text(insight.tip)
                    .font(Theme.bodySmall).italic()
                    .foregroundStyle(Theme.stone700)
                    .accessibilityLabel("Ayurvedic tip of the day: \(insight.tip)")
            }
        }
        .transition(.opacity)
    }

    private func quote(_ text: String) -> some View {
        Text("“\(text)”")
            .font(Theme.quote).italic()
            .foregroundStyle(Theme.stone700)
    }

    private var placeholder: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("A short reflection for today").font(Theme.heading())
            Text("A line or two of quiet wisdom for this moment of your day.").font(Theme.quote)
        }
        .redacted(reason: .placeholder)
        .accessibilityElement()
        .accessibilityLabel("Loading today's insight")
    }
}
