import BackgroundTasks
import EventKit
import Foundation
import Observation
import UserNotifications

/// The phone's calendar, read for busy and free time only, as the website
/// reads a connected one (src/hooks/useExternalCalendar.ts). Off until they
/// turn it on. Amrita gets the shape of the day (CalendarContext); titles,
/// places and people never leave the phone.
///
/// Free-time reminders are the phone's own notifications, planned from the
/// calendar whenever the app leaves the screen (and when iOS gives it a
/// moment in the background), so they need no server.
@MainActor
@Observable
final class CalendarStore: NSObject {
    static let shared = CalendarStore()

    private(set) var enabled: Bool
    private(set) var remindersOn: Bool
    private(set) var busy: [BusyInterval] = []
    /// Calendar access is turned off for PranaVeda in Settings.
    private(set) var blocked = false
    /// Notifications are turned off for PranaVeda in Settings.
    private(set) var remindersBlocked = false
    /// Set once the calendar has been read; free time is not trusted before.
    private(set) var readAt: Date?

    /// When they last finished a practice (no nudge for two hours after).
    @ObservationIgnored var lastPracticeAt: (() -> Date?)?
    /// A reminder was tapped: show the Amrita tab.
    @ObservationIgnored var onOpenReminder: (() -> Void)?

    private let defaults: UserDefaults
    @ObservationIgnored private lazy var store = EKEventStore()
    @ObservationIgnored private var watching: NSObjectProtocol?

    private static let enabledKey = "pranaveda_calendar_enabled"
    private static let remindersKey = "pranaveda_free_time_reminders"
    private static let plannedKey = "pranaveda_free_time_planned"
    private static let shownKey = "pranaveda_free_time_last_shown"
    private static let idPrefix = "free-time-"
    nonisolated static var refreshTaskId: String { (Bundle.main.bundleIdentifier ?? "com.pranaveda.app") + ".freetime" }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        enabled = defaults.bool(forKey: Self.enabledKey)
        remindersOn = defaults.bool(forKey: Self.remindersKey)
    }

    private var authorized: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }

    /// What goes with a message: nothing unless the calendar is on and read.
    var contextForAmrita: CalendarContext? {
        guard enabled, !blocked, readAt != nil else { return nil }
        return FreeTime.context(busy, now: Date())
    }

    /// The opening to offer on the welcome screen, if any.
    func openSlot(now: Date = Date()) -> OpenSlot? {
        guard enabled, !blocked, readAt != nil else { return nil }
        return FreeTime.openSlot(busy, now: now, lastPracticeAt: lastPracticeAt?())
    }

    // MARK: Turning it on and off

    /// From a tap, so the permission prompt has a clear cause. iOS has no
    /// "busy times only" access, so this asks for the calendar in full.
    func enable() async {
        let granted = (try? await store.requestFullAccessToEvents()) ?? false
        blocked = !granted
        guard granted else { return }
        enabled = true
        defaults.set(true, forKey: Self.enabledKey)
        refresh()
    }

    func disable() {
        enabled = false
        busy = []
        readAt = nil
        defaults.removeObject(forKey: Self.enabledKey)
        cancelReminders()
    }

    func setReminders(_ on: Bool) async {
        if on {
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
            remindersBlocked = !granted
            guard granted else { return }
        }
        remindersOn = on
        defaults.set(on, forKey: Self.remindersKey)
        if !on { cancelReminders() }
    }

    // MARK: Reading the calendar

    /// Today and tomorrow, as on the website.
    func refresh(now: Date = Date()) {
        guard enabled else { return }
        guard authorized else {
            blocked = true
            busy = []
            readAt = nil
            return
        }
        blocked = false
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: now)
        let end = calendar.date(byAdding: .day, value: 2, to: start)!
        let events = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil))
        setBusy(FreeTime.busy(from: events.map(Self.event)), readAt: now)
    }

    /// Stands in for the calendar (tests).
    func setBusy(_ busy: [BusyInterval], readAt: Date = Date()) {
        self.busy = busy
        self.readAt = readAt
    }

    private static func event(_ e: EKEvent) -> CalendarEvent {
        CalendarEvent(
            start: e.startDate, end: e.endDate, allDay: e.isAllDay,
            showsAsFree: e.availability == .free, cancelled: e.status == .canceled,
            declined: e.attendees?.first(where: \.isCurrentUser)?.participantStatus == .declined
        )
    }

    // MARK: On and off screen

    /// On screen: read the calendar afresh and hold back reminders (never
    /// while the app is open). Leaving: plan them from the calendar.
    func setActive(_ active: Bool) {
        if watching == nil {
            watching = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.refresh() }
            }
            UNUserNotificationCenter.current().delegate = self
        }
        refresh()
        if active { cancelReminders() } else { planReminders() }
    }

    /// The reminders for the rest of today and tomorrow, replacing any
    /// planned before. Starts 15 minutes from now, as the website waits for
    /// a tab to have been out of view that long.
    func planReminders(now: Date = Date()) {
        noteShown(now: now)
        cancelReminders()
        guard remindersOn, enabled, !blocked, readAt != nil else { return }
        let calendar = Calendar.current
        let end = calendar.date(byAdding: .day, value: 2, to: calendar.startOfDay(for: now))!
        let last = defaults.data(forKey: Self.shownKey).flatMap { try? JSONDecoder().decode(PlannedReminder.self, from: $0) }
        let planned = FreeTime.planReminders(busy, from: now.addingTimeInterval(FreeTime.awayBeforeReminder), until: end,
                                             lastPracticeAt: lastPracticeAt?(), last: last)
        defaults.set(try? JSONEncoder().encode(planned), forKey: Self.plannedKey)
        for reminder in planned {
            let content = UNMutableNotificationContent()
            content.title = "A moment for yourself"
            content.body = reminder.text + " Amrita has a practice that fits."
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, reminder.at.timeIntervalSince(now)), repeats: false)
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: Self.idPrefix + reminder.key, content: content, trigger: trigger))
        }
        scheduleBackgroundRefresh()
    }

    /// The planned reminders whose time has passed have been shown; the
    /// latest is the one the next must keep its distance from.
    private func noteShown(now: Date) {
        let planned = defaults.data(forKey: Self.plannedKey).flatMap { try? JSONDecoder().decode([PlannedReminder].self, from: $0) } ?? []
        if let shown = planned.last(where: { $0.at <= now }) {
            defaults.set(try? JSONEncoder().encode(shown), forKey: Self.shownKey)
        }
        defaults.removeObject(forKey: Self.plannedKey)
    }

    private func cancelReminders() {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ids = requests.map(\.identifier).filter { $0.hasPrefix(Self.idPrefix) }
            center.removePendingNotificationRequests(withIdentifiers: ids)
        }
    }

    // MARK: In the background

    /// Registered at launch: when iOS lends the app a moment, the calendar is
    /// read again and the reminders re-planned.
    nonisolated static func registerBackgroundRefresh() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshTaskId, using: .main) { task in
            MainActor.assumeIsolated {
                shared.refresh()
                shared.planReminders()
            }
            task.setTaskCompleted(success: true)
        }
    }

    private func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshTaskId)
        request.earliestBeginDate = Date().addingTimeInterval(60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}

extension CalendarStore: UNUserNotificationCenterDelegate {
    /// Never while the app is on screen: the welcome screen shows the opening.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        notification.request.identifier.hasPrefix("free-time-") ? [] : [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard response.notification.request.identifier.hasPrefix("free-time-") else { return }
        await MainActor.run { onOpenReminder?() }
    }
}
