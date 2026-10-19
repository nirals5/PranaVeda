import Charts
import SwiftUI

/// Recovery & Trends, part one: what the practice log shows, real data only.
/// (Heart and sleep from Apple Health come next.)
struct PracticeTrendsView: View {
    let practice: PracticeStore
    /// Apple Health readings, part two of the card.
    var health: HealthStore? = nil

    var body: some View {
        let trends = PracticeTrends(entries: practice.entries)
        VStack(alignment: .leading, spacing: 14) {
            Text("Recovery & Trends").sectionLabel().accessibilityAddTraits(.isHeader)
            if trends.isEmpty {
                Text("Your trends appear here as you practise: minutes each week, your streaks, and how rituals and breathwork balance out.")
                    .font(Theme.bodySmall)
                    .foregroundStyle(Theme.stone700)
            } else {
                thisWeek(trends)
                chart(trends)
                Divider().overlay(Theme.stone200.opacity(0.5))
                streaks(trends)
                if let share = trends.ritualShare { balance(share) }
            }
            if let health {
                Divider().overlay(Theme.stone200.opacity(0.5))
                HealthTrendsSection(health: health, practiceDays: Set(practice.entries.map(\.localDate)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func thisWeek(_ trends: PracticeTrends) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("This week").font(Theme.caption).foregroundStyle(Theme.stone500)
            Text(PracticeTrends.weekLine(trends.thisWeek)).font(Theme.heading(.title2)).foregroundStyle(Theme.ink)
            Text(PracticeTrends.lastWeekLine(trends.lastWeek))
                .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
        }
        .accessibilityElement(children: .combine)
    }

    private func chart(_ trends: PracticeTrends) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Minutes each week").labelFont().textCase(.uppercase).foregroundStyle(Theme.stone500)
            Chart {
                ForEach(trends.weeks) { week in
                    BarMark(x: .value("Week", week.start, unit: .weekOfYear), y: .value("Minutes", week.ritualMinutes))
                        .foregroundStyle(by: .value("Kind", "Ritual"))
                        .accessibilityLabel(week.start.formatted(.dateTime.month(.abbreviated).day()))
                        .accessibilityValue("\(week.minutes) minutes: \(week.rituals) rituals, \(week.breathwork) breathwork")
                    BarMark(x: .value("Week", week.start, unit: .weekOfYear), y: .value("Minutes", week.breathworkMinutes))
                        .foregroundStyle(by: .value("Kind", "Breathwork"))
                        .accessibilityHidden(true)
                }
            }
            .chartForegroundStyleScale(["Ritual": Theme.lavender, "Breathwork": Theme.lavenderTint])
            .chartLegend(position: .bottom, alignment: .leading)
            .chartXAxis {
                AxisMarks(values: .stride(by: .weekOfYear, count: 2)) { _ in
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                }
            }
            .chartYAxis { AxisMarks(position: .leading) }
            .frame(height: 160)
        }
    }

    private func streaks(_ trends: PracticeTrends) -> some View {
        HStack(alignment: .top) {
            stat("Current streak", days: trends.currentStreak)
            Spacer()
            stat("Longest streak", days: trends.longestStreak)
        }
    }

    private func stat(_ title: String, days: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Theme.caption).foregroundStyle(Theme.stone500)
            Text(days == 1 ? "1 day" : "\(days) days").font(Theme.heading()).foregroundStyle(Theme.ink)
        }
        .accessibilityElement(children: .combine)
    }

    /// How the last eight weeks divide between rituals and breathwork.
    private func balance(_ ritualShare: Double) -> some View {
        let ritual = Int((ritualShare * 100).rounded())
        return VStack(alignment: .leading, spacing: 6) {
            Text("Balance, last 8 weeks").font(Theme.caption).foregroundStyle(Theme.stone500)
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(Theme.lavender).frame(width: max(0, geo.size.width * ritualShare - 1))
                    Capsule().fill(Theme.lavenderTint)
                }
            }
            .frame(height: 8)
            Text("Rituals \(ritual)% · Breathwork \(100 - ritual)%").font(Theme.bodySmall).foregroundStyle(Theme.stone700)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Balance over the last 8 weeks: rituals \(ritual) percent, breathwork \(100 - ritual) percent")
    }
}
