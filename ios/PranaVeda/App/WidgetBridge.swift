import Foundation
import WidgetKit

/// Keeps the widgets' snapshot (Shared/WidgetSnapshot.swift) in step with the
/// app, and asks WidgetKit to redraw them when something they show changes.
@MainActor
enum WidgetBridge {
    private static var last: WidgetSnapshot?

    static func publish(entries: [PracticeLogEntry], saved: [SavedRitual], insight: DailyInsightStore.State, now: Date = Date()) {
        let snapshot = snapshot(entries: entries, saved: saved, insight: insight, previousInsight: last?.insight, now: now)
        guard snapshot != last else { return }
        last = snapshot
        snapshot.save()
        WidgetCenter.shared.reloadAllTimelines()
    }

    nonisolated static func snapshot(entries: [PracticeLogEntry], saved: [SavedRitual], insight: DailyInsightStore.State,
                                     previousInsight: WidgetSnapshot.Insight? = nil,
                                     now: Date, calendar: Calendar = .autoupdatingCurrent) -> WidgetSnapshot {
        var snapshot = WidgetSnapshot()
        let oldest = WidgetSnapshot.key(calendar.date(byAdding: .day, value: -WidgetSnapshot.daysKept, to: now)!, calendar)
        for entry in entries where entry.localDate >= oldest {
            var day = snapshot.days[entry.localDate] ?? WidgetSnapshot.Day()
            if entry.kind == .ritual { day.ritual = true } else { day.breathwork = true }
            snapshot.days[entry.localDate] = day
        }
        snapshot.newestSaved = saved.first.map { WidgetSnapshot.SavedRitualLink(id: $0.id, title: $0.title) }
        // A stand-in reflection is not shown on the home screen.
        if case .loaded(let reflection) = insight, !reflection.isFallback {
            snapshot.insight = .init(headline: reflection.headline, tip: reflection.tip, focus: reflection.focus,
                                     localDate: WidgetSnapshot.key(now, calendar))
        } else {
            snapshot.insight = previousInsight // keep today's while a new one loads; the widget hides it once its day has passed
        }
        return snapshot
    }
}
