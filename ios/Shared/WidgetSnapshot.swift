import Foundation

/// What the widgets show, written by the app into the App Group they share.
/// Widgets never call the server: the app saves this whenever the practice
/// log, saved rituals or today's insight change.
///
/// Days are kept rather than a ready-made streak, so the widget works the
/// streak, today and the week out for the moment it is shown and stays right
/// after midnight even if the app has not been opened.
struct WidgetSnapshot: Codable, Equatable, Sendable {
    struct Insight: Codable, Equatable, Sendable {
        let headline: String
        let tip: String
        let focus: String
        /// The "YYYY-MM-DD" it was written for; shown only on that day.
        let localDate: String
    }

    struct Day: Codable, Equatable, Sendable {
        var ritual = false
        var breathwork = false
    }

    struct SavedRitualLink: Codable, Equatable, Sendable {
        let id: String
        let title: String
    }

    var insight: Insight?
    /// Practice days of the last couple of months, by "YYYY-MM-DD".
    var days: [String: Day] = [:]
    var newestSaved: SavedRitualLink?

    static let empty = WidgetSnapshot()

    /// How many days are kept: enough for a long streak to read true.
    static let daysKept = 400

    // MARK: Reading it, for a given moment

    func streak(today: Date, calendar: Calendar = .autoupdatingCurrent) -> Int {
        var day = calendar.startOfDay(for: today)
        // The streak stays alive through today until the day ends.
        if days[Self.key(day, calendar)] == nil { day = calendar.date(byAdding: .day, value: -1, to: day)! }
        var count = 0
        while days[Self.key(day, calendar)] != nil {
            count += 1
            day = calendar.date(byAdding: .day, value: -1, to: day)!
        }
        return count
    }

    func practised(on date: Date, calendar: Calendar = .autoupdatingCurrent) -> Day? {
        days[Self.key(date, calendar)]
    }

    /// The week containing `today`, starting on the reader's first weekday.
    func week(of today: Date, calendar: Calendar = .autoupdatingCurrent) -> [(date: Date, day: Day?)] {
        let start = calendar.dateInterval(of: .weekOfYear, for: today)?.start ?? calendar.startOfDay(for: today)
        return (0..<7).map { offset in
            let date = calendar.date(byAdding: .day, value: offset, to: start)!
            return (date, days[Self.key(date, calendar)])
        }
    }

    /// Today's insight, or nil once its day has passed.
    func insight(for today: Date, calendar: Calendar = .autoupdatingCurrent) -> Insight? {
        guard let insight, insight.localDate == Self.key(today, calendar) else { return nil }
        return insight
    }

    nonisolated static func key(_ date: Date, _ calendar: Calendar = .autoupdatingCurrent) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    // MARK: Where it lives

    /// The App Group shared with the widgets: "group." + the app's identifier.
    static var groupID: String {
        (Bundle.main.object(forInfoDictionaryKey: "PVAppGroup") as? String) ?? "group.com.pranaveda.app"
    }

    static var fileURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID)?.appending(path: "widget-snapshot.json")
    }

    static func load(from url: URL? = fileURL) -> WidgetSnapshot {
        guard let url, let data = try? Data(contentsOf: url) else { return .empty }
        return (try? JSONDecoder().decode(WidgetSnapshot.self, from: data)) ?? .empty
    }

    func save(to url: URL? = Self.fileURL) {
        guard let url, let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: url, options: .atomic)
    }
}

/// Links the widgets open. Handled by the app (PranaVedaApp.onOpenURL).
enum WidgetLink {
    static let scheme = "pranaveda"
    /// The chat, already listening.
    static let talk = URL(string: "pranaveda://talk")!
    static let you = URL(string: "pranaveda://you")!
    /// The newest saved ritual's guided practice (Siri, app shortcuts).
    static let practice = URL(string: "pranaveda://practice")!
    static func savedRitual(_ id: String) -> URL { URL(string: "pranaveda://ritual/\(id)")! }
}
