#if SIRI_AI
import AppIntents
import SwiftUI

// The cards the new Siri shows for PranaVeda's answers (KAN-21), in the
// app's own look. iOS draws them ahead of time and keeps the picture, so
// they hold only text and symbols that are known at once.

@available(iOS 27.3, *)
extension SavedRitualEntity: SnippetRepresentableEntity {
    static var snippet: some EntitySnippetContent<Self> {
        CardSnippet(supportedFamilies: [.standard]) { ritual, _ in
            SiriCard(label: "Saved ritual", title: ritual.title, symbol: "figure.yoga") {
                if let minutes = ritual.minutes {
                    SiriCardFact(value: "\(minutes)", unit: "min")
                }
                SiriCardFact(value: "\(ritual.poses.count)", unit: ritual.poses.count == 1 ? "pose" : "poses")
            } detail: {
                if !ritual.poses.isEmpty {
                    Text(ritual.poses.prefix(4).joined(separator: " · ") + (ritual.poses.count > 4 ? " …" : ""))
                }
            }
        }
    }
}

@available(iOS 27.3, *)
extension PracticeSummaryEntity: SnippetRepresentableEntity {
    static var snippet: some EntitySnippetContent<Self> {
        CardSnippet(supportedFamilies: [.standard]) { summary, _ in
            SiriCard(label: "Your practice", title: summary.streakDays == 1 ? "1-day streak" : "\(summary.streakDays)-day streak", symbol: "flame") {
                SiriCardFact(value: "\(summary.practicesThisWeek)", unit: summary.practicesThisWeek == 1 ? "practice this week" : "practices this week")
                SiriCardFact(value: "\(summary.minutesThisWeek)", unit: "min this week")
            } detail: {
                EmptyView()
            }
        }
    }
}

@available(iOS 27.3, *)
extension LibraryPoseEntity: SnippetRepresentableEntity {
    static var snippet: some EntitySnippetContent<Self> {
        CardSnippet(supportedFamilies: [.standard]) { pose, _ in
            SiriCard(label: pose.level, title: pose.name, symbol: "figure.yoga") {
                Text(pose.sanskritName).font(Theme.bodySmall).italic().foregroundStyle(Theme.lavenderDeep)
            } detail: {
                Text(pose.bodyFocus)
            }
        }
    }
}

@available(iOS 27.3, *)
extension FlowEntity: SnippetRepresentableEntity {
    static var snippet: some EntitySnippetContent<Self> {
        CardSnippet(supportedFamilies: [.standard]) { flow, _ in
            SiriCard(label: flow.group, title: flow.title, symbol: "play.rectangle") {
                SiriCardFact(value: "\(flow.minutes)", unit: "min")
            } detail: {
                if !flow.poses.isEmpty {
                    Text(flow.poses.prefix(4).joined(separator: " · "))
                }
            }
        }
    }
}

@available(iOS 27.3, *)
private struct SiriCard<Facts: View, Detail: View>: View {
    let label: String
    let title: String
    let symbol: String
    @ViewBuilder var facts: Facts
    @ViewBuilder var detail: Detail

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                Text(label.uppercased()).font(Theme.label).tracking(0.9)
            }
            .foregroundStyle(Theme.lavenderDeep)
            Text(title).font(Theme.heading(.title2)).foregroundStyle(Theme.ink)
            HStack(alignment: .firstTextBaseline, spacing: 18) { facts }
            detail.font(Theme.bodySmall).foregroundStyle(Theme.stone700)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(LinearGradient(colors: [Theme.lavenderTint, Theme.peachTint], startPoint: .topLeading, endPoint: .bottomTrailing))
    }
}

@available(iOS 27.3, *)
private struct SiriCardFact: View {
    let value: String
    let unit: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(value).font(Theme.heading(.title3)).foregroundStyle(Theme.ink)
            Text(unit).font(Theme.caption).foregroundStyle(Theme.stone700)
        }
    }
}
#endif
