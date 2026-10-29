import Foundation

/// When they are busy and when they are free, by the website's rules
/// (src/hooks/useExternalCalendar.ts and useNudgeNotifications.ts). Only
/// times are kept: what an event is never leaves the calendar.
struct BusyInterval: Equatable, Sendable {
    var start: Date
    var end: Date
}

/// One event as the calendar gives it, reduced to what decides whether it
/// makes them busy.
struct CalendarEvent: Equatable, Sendable {
    let start: Date
    let end: Date
    var allDay = false
    /// Marked "free" (availability), so it does not block time.
    var showsAsFree = false
    var cancelled = false
    /// They declined the invitation.
    var declined = false
}

/// An opening Amrita may nudge in. One opening is one nudge, keyed by where
/// it ends.
struct OpenSlot: Equatable, Sendable {
    let key: String
    /// When the next commitment starts; nil when open for the rest of the day.
    let until: Date?
    let minutes: Int?
}

/// What goes with a message, as the website sends it (CalendarContext in
/// api/index.ts): the shape of the day, never what the commitments are.
struct CalendarContext: Encodable, Equatable, Sendable {
    let now: String
    let busyToday: [String]
    let busyTomorrow: [String]
}

/// A reminder the phone will show by itself.
struct PlannedReminder: Codable, Equatable, Sendable {
    let at: Date
    let key: String
    let text: String
}

enum FreeTime {
    static let minFreeMinutes = 10
    /// Nudges only from 7 AM until 10 PM.
    static let wakingHours = 7..<22
    static let restAfterPractice: TimeInterval = 2 * 60 * 60
    /// The app has been off screen this long before a reminder.
    static let awayBeforeReminder: TimeInterval = 15 * 60
    /// A day of short gaps must not become a stream of reminders.
    static let minGapBetweenReminders: TimeInterval = 3 * 60 * 60

    /// All-day, cancelled, declined and "free" events leave the time open;
    /// the rest are merged into busy intervals.
    static func busy(from events: [CalendarEvent]) -> [BusyInterval] {
        merge(events.filter { !$0.allDay && !$0.showsAsFree && !$0.cancelled && !$0.declined && $0.end > $0.start }
            .map { BusyInterval(start: $0.start, end: $0.end) })
    }

    static func merge(_ intervals: [BusyInterval]) -> [BusyInterval] {
        var merged: [BusyInterval] = []
        for interval in intervals.sorted(by: { $0.start < $1.start }) {
            if let last = merged.last, interval.start <= last.end {
                merged[merged.count - 1].end = max(last.end, interval.end)
            } else {
                merged.append(interval)
            }
        }
        return merged
    }

    /// Where `now` falls: inside a commitment (until = when it ends) or in
    /// open time (until = when the next one starts, nil if none is in view).
    static func window(_ busy: [BusyInterval], now: Date) -> (busyNow: Bool, until: Date?) {
        if let current = busy.first(where: { $0.start <= now && now < $0.end }) { return (true, current.end) }
        return (false, busy.first { $0.start > now }?.start)
    }

    /// The opening Amrita may nudge in at `now`, if any: never during a
    /// commitment, in a gap too short to practise, outside waking hours, or
    /// right after a practice.
    static func openSlot(_ busy: [BusyInterval], now: Date, lastPracticeAt: Date?, calendar: Calendar = .current) -> OpenSlot? {
        let (busyNow, until) = window(busy, now: now)
        let hour = calendar.component(.hour, from: now)
        let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
        let openUntil = until.flatMap { $0 < midnight ? $0 : nil }
        let minutes = openUntil.map { Int($0.timeIntervalSince(now) / 60) }
        if busyNow || !wakingHours.contains(hour) || (minutes ?? .max) < minFreeMinutes { return nil }
        if let lastPracticeAt, now.timeIntervalSince(lastPracticeAt) < restAfterPractice { return nil }
        return OpenSlot(key: String(Int((openUntil ?? midnight).timeIntervalSince1970 * 1000)), until: openUntil, minutes: minutes)
    }

    static func describe(_ slot: OpenSlot, timeZone: TimeZone = .current) -> String {
        if let minutes = slot.minutes, let until = slot.until {
            return "You have \(minutes) open minutes, until \(time(until, timeZone: timeZone))."
        }
        return "Your calendar is open for the rest of today."
    }

    /// What "Practice now" says to Amrita, as on the website.
    static func practiceNow(_ slot: OpenSlot) -> String {
        slot.minutes.map { "I have about \($0) free minutes right now. What would you suggest?" }
            ?? "I have some open time right now. What would you suggest?"
    }

    static func context(_ busy: [BusyInterval], now: Date, calendar: Calendar = .current) -> CalendarContext {
        let today = calendar.startOfDay(for: now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)!
        let after = calendar.date(byAdding: .day, value: 2, to: today)!
        let tz = calendar.timeZone
        let (busyNow, until) = window(busy, now: now)
        let range = { (b: BusyInterval) in "\(time(b.start, timeZone: tz))–\(time(b.end, timeZone: tz))" }
        let state: String
        if busyNow, let until {
            state = "In a commitment until \(time(until, timeZone: tz))"
        } else if let until, until < tomorrow {
            state = "Free for about \(Int((until.timeIntervalSince(now) / 60).rounded())) minutes, until \(time(until, timeZone: tz))"
        } else {
            state = "Free for the rest of today"
        }
        return CalendarContext(
            now: state,
            busyToday: busy.filter { $0.end > now && $0.start < tomorrow }.map(range),
            busyTomorrow: busy.filter { $0.start >= tomorrow && $0.start < after }.map(range)
        )
    }

    /// "9:35 PM" with an ordinary space (iOS puts a narrow one before PM,
    /// which the server would drop).
    static func time(_ date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = timeZone
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter.string(from: date).replacingOccurrences(of: "\u{202F}", with: " ")
    }

    /// The reminders to leave with the phone from `start` to `end`: the first
    /// moment of each opening the rules allow, at most one per opening and at
    /// least three hours apart. `last` is the reminder already shown.
    static func planReminders(
        _ busy: [BusyInterval], from start: Date, until end: Date, lastPracticeAt: Date?,
        last: PlannedReminder?, limit: Int = 4, calendar: Calendar = .current
    ) -> [PlannedReminder] {
        var candidates = [start] + busy.map(\.end).filter { $0 > start && $0 < end }
        var day = calendar.startOfDay(for: start)
        while day < end {
            if let morning = calendar.date(bySettingHour: wakingHours.lowerBound, minute: 0, second: 0, of: day), morning > start, morning < end {
                candidates.append(morning)
            }
            day = calendar.date(byAdding: .day, value: 1, to: day)!
        }
        var planned: [PlannedReminder] = []
        var previous = last
        for at in Set(candidates).sorted() {
            guard planned.count < limit, let slot = openSlot(busy, now: at, lastPracticeAt: lastPracticeAt, calendar: calendar) else { continue }
            if let previous, previous.key == slot.key || at.timeIntervalSince(previous.at) < minGapBetweenReminders { continue }
            let reminder = PlannedReminder(at: at, key: slot.key, text: describe(slot, timeZone: calendar.timeZone))
            planned.append(reminder)
            previous = reminder
        }
        return planned
    }
}
