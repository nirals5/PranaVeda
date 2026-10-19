import SwiftUI
import WidgetKit

@main
struct PranaVedaWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        WeekWidget()
        PracticeLiveActivityWidget()
        if #available(iOS 18.0, *) {
            TalkToAmritaControl()
        }
    }
}

// MARK: Timeline

struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

/// The app writes the snapshot and asks for a redraw when it changes; the
/// timeline only needs to roll over at midnight, when "today" changes.
struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snapshot: context.isPreview ? .preview : WidgetSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let now = Date()
        let snapshot = WidgetSnapshot.load()
        let midnight = Calendar.autoupdatingCurrent.startOfDay(for: now.addingTimeInterval(86_400))
        completion(Timeline(entries: [SnapshotEntry(date: now, snapshot: snapshot), SnapshotEntry(date: midnight, snapshot: snapshot)],
                            policy: .after(midnight.addingTimeInterval(60))))
    }
}

extension WidgetSnapshot {
    /// The widget gallery's example.
    static var preview: WidgetSnapshot {
        let calendar = Calendar.autoupdatingCurrent
        var snapshot = WidgetSnapshot()
        for back in [0, 1, 2, 4] {
            let day = calendar.date(byAdding: .day, value: -back, to: Date())!
            snapshot.days[key(day, calendar)] = Day(ritual: back != 1, breathwork: back == 1)
        }
        snapshot.insight = Insight(headline: "Evening settles the restless mind", tip: "Warm sesame oil on the feet before bed.",
                                   focus: "Grounding", localDate: key(Date(), calendar))
        snapshot.newestSaved = SavedRitualLink(id: "preview", title: "Easing the Spine")
        return snapshot
    }
}

// MARK: Look

/// The app's palette and type (Theme.swift), for the widgets.
enum WTheme {
    static let lavender = Color(red: 0x8A / 255, green: 0x79 / 255, blue: 0xA5 / 255)
    static let lavenderDeep = Color(red: 0x71 / 255, green: 0x60 / 255, blue: 0x8E / 255)
    static let lavenderTint = Color(red: 0xE8 / 255, green: 0xE1 / 255, blue: 0xF2 / 255)
    static let peachTint = Color(red: 0xFB / 255, green: 0xED / 255, blue: 0xE9 / 255)
    static let ink = Color(red: 0x2D / 255, green: 0x34 / 255, blue: 0x36 / 255)
    static let stone700 = Color(red: 0x44 / 255, green: 0x51 / 255, blue: 0x5A / 255)
    static let stone500 = Color(red: 0x78 / 255, green: 0x90 / 255, blue: 0x9C / 255)

    static func serif(_ size: CGFloat, _ style: Font.TextStyle) -> Font { .custom("Playfair Display", size: size, relativeTo: style) }
    static func sans(_ size: CGFloat, _ style: Font.TextStyle) -> Font { .custom("Plus Jakarta Sans", size: size, relativeTo: style) }
    static let label = Font.system(.caption2, design: .monospaced, weight: .bold)

    static let background = LinearGradient(colors: [.white, peachTint, lavenderTint], startPoint: .bottomLeading, endPoint: .topTrailing)
}

struct WidgetLabel: View {
    let text: String
    var body: some View {
        Text(text).font(WTheme.label).tracking(0.8).textCase(.uppercase).foregroundStyle(WTheme.stone500)
    }
}

/// A ritual is a filled dot, breathwork a hollow ring, as on the calendar.
struct DayMark: View {
    let day: WidgetSnapshot.Day?
    var body: some View {
        Circle()
            .fill(day?.ritual == true ? WTheme.lavender : .clear)
            .overlay(Circle().stroke(day == nil ? WTheme.stone500.opacity(0.35) : WTheme.lavender, lineWidth: 1.2))
            .frame(width: 9, height: 9)
    }
}

// MARK: Today

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "today", provider: SnapshotProvider()) { entry in
            TodayView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Your streak, whether you have practised today, and Amrita's reflection for the day.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct TodayView: View {
    let entry: SnapshotEntry
    @Environment(\.widgetFamily) private var family

    private var streak: Int { entry.snapshot.streak(today: entry.date) }
    private var practisedToday: Bool { entry.snapshot.practised(on: entry.date) != nil }
    private var streakLine: String { streak == 1 ? "1-day streak" : "\(streak)-day streak" }
    private var todayLine: String { practisedToday ? "Practised today" : "Not yet today" }

    var body: some View {
        content.containerBackground(for: .widget) { WTheme.background }
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        // The lock screen shows only the streak and today, never the reflection.
        case .accessoryCircular:
            VStack(spacing: 0) {
                Text("\(streak)").font(.system(.title2, design: .rounded, weight: .semibold))
                Image(systemName: practisedToday ? "checkmark" : "leaf").font(.caption2)
            }
            .widgetURL(WidgetLink.you)
            .accessibilityLabel("\(streakLine), \(todayLine.lowercased())")
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("PranaVeda").font(.headline)
                Text(streakLine)
                Text(todayLine).foregroundStyle(.secondary)
            }
            .widgetURL(WidgetLink.you)
        case .accessoryInline:
            Text("\(streakLine) · \(todayLine.lowercased())").widgetURL(WidgetLink.you)
        case .systemMedium:
            medium
        default:
            small
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetLabel(text: "Your practice")
            Spacer(minLength: 0)
            Text("\(streak)").font(WTheme.serif(40, .largeTitle)).foregroundStyle(WTheme.ink)
            Text("day streak").font(WTheme.sans(13, .caption)).foregroundStyle(WTheme.stone700)
            Label(todayLine, systemImage: practisedToday ? "checkmark.circle.fill" : "circle")
                .font(WTheme.sans(12, .caption2))
                .foregroundStyle(practisedToday ? WTheme.lavenderDeep : WTheme.stone500)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(WidgetLink.talk)
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                WidgetLabel(text: "Today")
                if let insight = entry.snapshot.insight(for: entry.date) {
                    Text(insight.headline).font(WTheme.serif(16, .headline)).foregroundStyle(WTheme.ink).lineLimit(2)
                    Text(insight.tip).font(WTheme.sans(12, .caption)).italic().foregroundStyle(WTheme.stone700).lineLimit(3)
                } else {
                    Text("Open PranaVeda for today's reflection").font(WTheme.serif(15, .headline)).foregroundStyle(WTheme.ink).lineLimit(3)
                }
                Spacer(minLength: 0)
                Link(destination: WidgetLink.talk) {
                    Label("Talk to Amrita", systemImage: "mic")
                        .font(WTheme.sans(12, .caption).weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(WTheme.lavender, in: Capsule())
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                Text("\(streak)").font(WTheme.serif(34, .largeTitle)).foregroundStyle(WTheme.ink)
                Text("day streak").font(WTheme.sans(12, .caption)).foregroundStyle(WTheme.stone700)
                Label(todayLine, systemImage: practisedToday ? "checkmark.circle.fill" : "circle")
                    .font(WTheme.sans(11, .caption2)).foregroundStyle(practisedToday ? WTheme.lavenderDeep : WTheme.stone500)
                Spacer(minLength: 0)
                if let saved = entry.snapshot.newestSaved {
                    Link(destination: WidgetLink.savedRitual(saved.id)) {
                        Label(saved.title, systemImage: "bookmark.fill")
                            .font(WTheme.sans(11, .caption2)).foregroundStyle(WTheme.lavenderDeep).lineLimit(2)
                    }
                }
            }
            .frame(width: 112, alignment: .leading)
        }
    }
}

// MARK: Week

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "week", provider: SnapshotProvider()) { entry in
            WeekView(entry: entry)
        }
        .configurationDisplayName("This week")
        .description("The days you practised this week: a dot for a ritual, a ring for breathwork.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct WeekView: View {
    let entry: SnapshotEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let week = entry.snapshot.week(of: entry.date)
        let count = week.filter { $0.day != nil }.count
        let calendar = Calendar.autoupdatingCurrent
        VStack(alignment: .leading, spacing: 10) {
            WidgetLabel(text: "This week")
            Text(count == 1 ? "1 day of practice" : "\(count) days of practice")
                .font(WTheme.serif(family == .systemSmall ? 17 : 20, .headline)).foregroundStyle(WTheme.ink)
            Spacer(minLength: 0)
            HStack(spacing: 0) {
                ForEach(Array(week.enumerated()), id: \.offset) { _, item in
                    let isToday = calendar.isDate(item.date, inSameDayAs: entry.date)
                    VStack(spacing: 5) {
                        Text(item.date, format: .dateTime.weekday(.narrow))
                            .font(WTheme.label)
                            .foregroundStyle(isToday ? WTheme.lavenderDeep : WTheme.stone500)
                        DayMark(day: item.day)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(count) of 7 days practised this week")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { WTheme.background }
        .widgetURL(WidgetLink.you)
    }
}
