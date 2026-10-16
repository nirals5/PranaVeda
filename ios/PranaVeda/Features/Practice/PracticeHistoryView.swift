import SwiftUI

/// The streak and the most recent practices, newest first. A ritual that
/// still has its snapshot opens again when tapped.
struct PracticeHistoryView: View {
    let practice: PracticeStore
    var limit = 10
    @State private var reopening: RecommendationResult?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Your practice").sectionLabel()
            if practice.entries.isEmpty {
                Text("Practices you finish appear here. Begin one from a ritual or a breathwork card in your conversation with Amrita.")
                    .font(Theme.body)
                    .foregroundStyle(Theme.stone700)
            } else {
                Text(Self.streakLine(practice.streak, total: practice.entries.count))
                    .font(Theme.heading(.title2))
                    .foregroundStyle(Theme.ink)
                VStack(spacing: 0) {
                    ForEach(practice.entries.suffix(limit).reversed()) { entry in
                        row(entry)
                        if entry.id != practice.entries.suffix(limit).first?.id { Divider() }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .sheet(item: $reopening) { RitualDetailView(result: $0) }
    }

    /// "3-day streak · 12 practices"
    nonisolated static func streakLine(_ streak: Int, total: Int) -> String {
        let practices = total == 1 ? "1 practice" : "\(total) practices"
        guard streak > 0 else { return practices }
        return "\(streak)-day streak · \(practices)"
    }

    /// "Today", "Yesterday", or "Mon 12 Oct".
    nonisolated static func dayLabel(_ localDate: String, today: Date = Date(), timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        if localDate == ChatViewModel.localDate(today, in: timeZone) { return "Today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: today), localDate == ChatViewModel.localDate(yesterday, in: timeZone) {
            return "Yesterday"
        }
        let parser = DateFormatter()
        parser.calendar = calendar
        parser.timeZone = timeZone
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: localDate) else { return localDate }
        let out = DateFormatter()
        out.calendar = calendar
        out.timeZone = timeZone
        out.setLocalizedDateFormatFromTemplate("EEE d MMM")
        return out.string(from: date)
    }

    @ViewBuilder
    private func row(_ entry: PracticeLogEntry) -> some View {
        let content = HStack(spacing: 12) {
            Image(systemName: entry.kind == .ritual ? "figure.mind.and.body" : "wind")
                .foregroundStyle(Theme.lavender)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title).font(Theme.itemTitle).foregroundStyle(Theme.ink).lineLimit(2)
                Text("\(Self.dayLabel(entry.localDate)) · \(entry.durationMinutes) min")
                    .font(Theme.caption)
                    .foregroundStyle(Theme.stone500)
            }
            Spacer()
            if entry.kind == .ritual, entry.result != nil {
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.stone500)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())

        if entry.kind == .ritual, let result = entry.result {
            Button { reopening = result } label: { content }
                .buttonStyle(.plain)
                .accessibilityHint("Opens this ritual again")
        } else {
            content
        }
    }
}

extension RecommendationResult: Identifiable {
    public var id: String { yogaPractice.title + (summary ?? "") }
}
