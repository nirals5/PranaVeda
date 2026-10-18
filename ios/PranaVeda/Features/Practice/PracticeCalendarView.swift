import SwiftUI

/// The website's practice calendar: a month of days marked with what was
/// practiced (a filled dot for a ritual, a ring for breathwork), and the
/// chosen day's practices below. A ritual that still has its snapshot opens
/// again.
struct PracticeCalendarView: View {
    let practice: PracticeStore
    /// Over to the chat, for "Begin with Amrita" on an empty today.
    var onBegin: () -> Void = {}

    private let grid = PracticeCalendar()
    @State private var month = Date()
    @State private var selected: String?
    @State private var reopening: RecommendationResult?

    private var today: String { grid.key(Date()) }
    private var selectedKey: String { selected ?? today }

    var body: some View {
        let byDay = PracticeCalendar.byDay(practice.entries)
        let keys = grid.dayKeys(month)
        VStack(alignment: .leading, spacing: 16) {
            header(count: keys.reduce(0) { $0 + (byDay[$1]?.count ?? 0) })
            monthGrid(keys: keys, byDay: byDay)
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            legend
            Divider().overlay(Theme.stone200.opacity(0.5))
            selectedDay(byDay[selectedKey] ?? [])
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .sheet(item: $reopening) { RitualDetailView(result: $0) }
    }

    private func header(count: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Practice calendar").sectionLabel()
                Spacer()
                Button("Today") {
                    month = Date()
                    selected = nil
                }
                .labelFont()
                .textCase(.uppercase)
                .tint(Theme.lavenderDeep)
            }
            HStack {
                Text(month, format: .dateTime.month(.wide).year())
                    .font(Theme.heading(.title2))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                monthButton("chevron.left", label: "Previous month", by: -1)
                monthButton("chevron.right", label: "Next month", by: 1)
            }
            Text(PracticeCalendar.monthLine(count: count, streak: practice.streak))
                .font(Theme.caption)
                .foregroundStyle(Theme.stone500)
        }
    }

    private func monthButton(_ symbol: String, label: String, by step: Int) -> some View {
        Button {
            month = grid.adding(months: step, to: month)
        } label: {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .frame(width: 36, height: 36)
                .background(.white.opacity(0.6), in: Circle())
        }
        .tint(Theme.stone700)
        .accessibilityLabel(label)
    }

    private func monthGrid(keys: [String], byDay: [String: [PracticeLogEntry]]) -> some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
        // The grid is a map of the month: it grows to the first accessibility
        // size, and the chosen day's panel below shows everything at full size
        // (VoiceOver reads each day in full).
        return LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Array(grid.weekdays.enumerated()), id: \.offset) { _, day in
                Text(day.short)
                    .labelFont()
                    .foregroundStyle(Theme.stone500)
                    .accessibilityLabel(day.long)
            }
            ForEach(0..<grid.leadingBlanks(month), id: \.self) { _ in Color.clear.frame(height: 1) }
            ForEach(Array(keys.enumerated()), id: \.element) { index, key in
                dayCell(key, number: index + 1, entries: byDay[key] ?? [])
            }
        }
    }

    private func dayCell(_ key: String, number: Int, entries: [PracticeLogEntry]) -> some View {
        let isSelected = key == selectedKey
        let isToday = key == today
        return Button { selected = key } label: {
            VStack(spacing: 4) {
                Text("\(number)")
                    .font(isToday ? Theme.body.weight(.semibold) : Theme.body)
                    .lineLimit(1).minimumScaleFactor(0.5) // a date never wraps in its cell
                    .foregroundStyle(isSelected ? .white : key > today ? Theme.stone500 : Theme.ink)
                HStack(spacing: 2) {
                    ForEach(entries.prefix(3)) { PracticeMarker(kind: $0.kind, inverted: isSelected) }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.vertical, 2)
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isSelected ? Theme.lavender.opacity(0.9) : .clear)
            }
            .overlay {
                if isToday && !isSelected {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.lavender.opacity(0.6))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(grid.dayDescription(key, practices: entries.count, today: today))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var legend: some View {
        HStack(spacing: 18) {
            Label { Text("Ritual") } icon: { PracticeMarker(kind: .ritual) }
            Label { Text("Breathwork") } icon: { PracticeMarker(kind: .breathwork) }
        }
        .labelStyle(MarkerLabelStyle())
        .labelFont()
        .textCase(.uppercase)
        .foregroundStyle(Theme.stone500)
        .accessibilityHidden(true)
    }

    private func selectedDay(_ entries: [PracticeLogEntry]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(selectedKey == today ? "Today" : selectedKey > today ? "Ahead" : "That day").sectionLabel()
            if let date = grid.date(selectedKey) {
                Text(date, format: .dateTime.weekday(.wide).month(.wide).day())
                    .font(Theme.heading())
                    .foregroundStyle(Theme.ink)
            }
            if entries.isEmpty {
                Text(PracticeCalendar.emptyDayLine(selectedKey, today: today))
                    .font(Theme.quote).italic()
                    .foregroundStyle(Theme.stone700)
                if selectedKey == today {
                    Button(action: onBegin) {
                        Label("Begin with Amrita", systemImage: "arrow.right")
                            .labelStyle(TrailingIconLabelStyle())
                            .labelFont()
                            .tracking(0.9)
                            .textCase(.uppercase)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 12)
                            .background(Theme.lavender, in: Capsule())
                    }
                }
            } else {
                ForEach(entries) { entry in
                    entryRow(entry)
                    if entry.id != entries.last?.id { Divider() }
                }
            }
        }
        .animation(.easeOut(duration: 0.2), value: selectedKey)
    }

    private func entryRow(_ entry: PracticeLogEntry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                PracticeMarker(kind: entry.kind)
                Text(entryDetail(entry))
            }
            .labelFont()
            .textCase(.uppercase)
            .foregroundStyle(Theme.stone500)
            Text(entry.title).font(Theme.heading(.headline)).foregroundStyle(Theme.ink)
            if let result = entry.result {
                Button { reopening = result } label: {
                    Label("Open ritual", systemImage: "arrow.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .labelFont()
                        .textCase(.uppercase)
                }
                .tint(Theme.lavenderDeep)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// "Ritual · 7:30 PM · 10 min"
    private func entryDetail(_ entry: PracticeLogEntry) -> String {
        let kind = entry.kind == .ritual ? "Ritual" : "Breathwork"
        let time = entry.completedDate.map { $0.formatted(date: .omitted, time: .shortened) }
        return ([kind] + [time].compactMap { $0 } + ["\(entry.durationMinutes) min"]).joined(separator: " · ")
    }
}

/// A ritual is a filled dot, breathwork a hollow ring: the shape carries the
/// meaning, so it still reads on the selected (lavender) day.
struct PracticeMarker: View {
    let kind: PracticeLogEntry.Kind
    var inverted = false

    var body: some View {
        let tone = inverted ? Color.white : Theme.lavender
        Circle()
            .fill(kind == .ritual ? tone : .clear)
            .overlay(Circle().stroke(tone, lineWidth: 1))
            .frame(width: 6, height: 6)
    }
}

private struct MarkerLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) { configuration.icon; configuration.title }
    }
}

/// The icon after the words ("Open ritual →"). Also used on the Dosha screen.
struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.title; configuration.icon }
    }
}

extension RecommendationResult: Identifiable {
    public var id: String { yogaPractice.title + (summary ?? "") }
}
