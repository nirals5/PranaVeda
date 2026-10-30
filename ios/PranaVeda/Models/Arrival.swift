import CoreLocation
import Foundation
import Observation
import UIKit
import UserNotifications

/// Arrival reminders: a gentle note when they get to a saved place (home, a
/// studio, an outdoor spot) and stay a few minutes. The phone itself watches
/// the places, so it works with the app closed; nothing reaches a server.
/// Paced with the free-time reminders: waking hours only, not soon after a
/// practice, at least three hours after any PranaVeda reminder, and at most
/// once a day for each place.
enum Arrival {
    /// Work is left out: a nudge on walking into work would intrude.
    static let kinds: [PlaceKind] = [.home, .studio, .outdoors]
    static let radiusMetres = PlaceMatching.matchRadiusMetres
    /// They must stay this long, so passing by or a quick stop doesn't count.
    static let stay: TimeInterval = 5 * 60

    static func text(_ kind: PlaceKind) -> String {
        switch kind {
        case .home: "You're home. A few minutes of slow breathing to settle in?"
        case .studio: "You're at the studio, with room for a fuller practice. Amrita can guide you."
        case .outdoors: "You're at your outdoor spot. A standing practice here?"
        case .work: "You're at work. Something quiet at your desk?"
        }
    }

    /// Whether a reminder may show `at` (the end of the stay).
    static func shouldRemind(
        _ kind: PlaceKind, at: Date, lastPracticeAt: Date?, lastReminderAt: Date?,
        remindedAt: Date?, busyNow: Bool, calendar: Calendar = .current
    ) -> Bool {
        guard kinds.contains(kind), !busyNow, FreeTime.wakingHours.contains(calendar.component(.hour, from: at)) else { return false }
        if let lastPracticeAt, at.timeIntervalSince(lastPracticeAt) < FreeTime.restAfterPractice { return false }
        if let lastReminderAt, at.timeIntervalSince(lastReminderAt) < FreeTime.minGapBetweenReminders { return false }
        if let remindedAt, calendar.isDate(remindedAt, inSameDayAs: at) { return false }
        return true
    }
}

@MainActor
@Observable
final class ArrivalStore: NSObject {
    static let shared = ArrivalStore()

    private(set) var on: Bool
    /// Location isn't set to "Always" for PranaVeda, so arrivals can't be noticed.
    private(set) var needsAlways = false
    /// Notifications are turned off for PranaVeda in Settings.
    private(set) var notificationsBlocked = false

    private let defaults: UserDefaults
    @ObservationIgnored private lazy var manager: CLLocationManager = {
        let manager = CLLocationManager()
        manager.delegate = self
        return manager
    }()
    /// Opened once: a second monitor with the same name ends the app.
    @ObservationIgnored private var monitor: Task<CLMonitor, Never>?
    @ObservationIgnored private var listening: Task<Void, Never>?
    @ObservationIgnored private var syncing: Task<Void, Never>?
    /// Waiting for the answer to "Always".
    @ObservationIgnored private var askingForAlways: CheckedContinuation<Void, Never>?

    private static let onKey = "pranaveda_arrival_reminders"
    /// Place → "inside" or "outside", as last reported; a reminder only on a move from outside to inside.
    private static let stateKey = "pranaveda_arrival_state"
    /// Place → when its latest reminder shows (seconds since 1970).
    private nonisolated static let scheduledKey = "pranaveda_arrival_scheduled"
    nonisolated static let idPrefix = "arrival-"
    /// Letters only: CoreLocation refuses a name with a hyphen.
    private static let monitorName = "PranaVedaArrivals"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        on = defaults.bool(forKey: Self.onKey)
        super.init()
        needsAlways = on && manager.authorizationStatus != .authorizedAlways
    }

    // MARK: Turning it on and off

    /// From a tap: notifications first, then location "Always".
    func setOn(_ value: Bool) async {
        guard value else {
            on = false
            defaults.removeObject(forKey: Self.onKey)
            await sync()
            return
        }
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
        notificationsBlocked = !granted
        guard granted else { return }
        if manager.authorizationStatus == .authorizedWhenInUse {
            // iOS asks once; after that the choice is made in Settings.
            await withCheckedContinuation { continuation in
                askingForAlways = continuation
                manager.requestAlwaysAuthorization()
                // No answer comes if iOS has asked before, or if they keep
                // "While Using": done once the question is off screen.
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(1))
                    while self.alwaysPromptShowing { try? await Task.sleep(for: .milliseconds(500)) }
                    self.finishAsking()
                }
            }
        }
        needsAlways = manager.authorizationStatus != .authorizedAlways
        on = true
        defaults.set(true, forKey: Self.onKey)
        await sync()
    }

    /// Set while iOS shows the "Always" question (the app is inactive then).
    private var alwaysPromptShowing: Bool { UIApplication.shared.applicationState == .inactive }

    private func finishAsking() {
        askingForAlways?.resume()
        askingForAlways = nil
    }

    /// At launch, in the foreground or when iOS wakes the app for an arrival.
    func resume() {
        guard on else { return }
        Task { await sync() }
    }

    /// The app came on screen: Settings may have changed "Always".
    func refreshPermission() {
        guard on else { return }
        needsAlways = manager.authorizationStatus != .authorizedAlways
    }

    // MARK: Watching the places

    /// Watches each saved place that takes reminders, or none when off. One
    /// at a time: a place changed while turning on must not be added twice.
    func sync() async {
        let previous = syncing
        let next = Task { await previous?.value; await syncNow() }
        syncing = next
        await next.value
    }

    private func syncNow() async {
        let places = on && defaults.bool(forKey: PlaceStore.enabledKey) ? PlaceStore.savedPlaces(defaults: defaults).filter { Arrival.kinds.contains($0.kind) } : []
        if places.isEmpty, monitor == nil, !on { return }
        let monitor = await openMonitor()
        let wanted = Dictionary(uniqueKeysWithValues: places.map { ($0.kind.rawValue, $0) })
        var states = defaults.dictionary(forKey: Self.stateKey) as? [String: String] ?? [:]
        for id in await monitor.identifiers where wanted[id] == nil {
            await monitor.remove(id)
            states[id] = nil
        }
        for (id, place) in wanted {
            let center = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lon)
            // Kept unless moved, or iOS stopped watching it (added before "Always", say).
            if let record = await monitor.record(for: id),
               !Self.unwatched(record.lastEvent.state),
               let current = record.condition as? CLMonitor.CircularGeographicCondition,
               current.center.latitude == center.latitude, current.center.longitude == center.longitude {
                continue
            }
            // New or moved: its first report says where they are, not an arrival.
            await monitor.add(CLMonitor.CircularGeographicCondition(center: center, radius: Arrival.radiusMetres), identifier: id)
            states[id] = nil
        }
        defaults.set(states, forKey: Self.stateKey)
        if !on { cancelPending() }
    }

    private static func unwatched(_ state: CLMonitor.Event.State) -> Bool {
        if #available(iOS 17.2, *) { return state == .unmonitored }
        return false
    }

    private func openMonitor() async -> CLMonitor {
        if let monitor { return await monitor.value }
        let opening = Task { await CLMonitor(Self.monitorName) }
        monitor = opening
        let monitor = await opening.value
        listening = Task { [weak self] in
            do {
                for try await event in await monitor.events {
                    await self?.handle(event.identifier, inside: event.state == .satisfied, outside: event.state == .unsatisfied)
                }
            } catch {}
        }
        return monitor
    }

    private func handle(_ id: String, inside: Bool, outside: Bool) {
        guard inside || outside, let kind = PlaceKind(rawValue: id) else { return }
        var states = defaults.dictionary(forKey: Self.stateKey) as? [String: String] ?? [:]
        let before = states[id]
        states[id] = inside ? "inside" : "outside"
        defaults.set(states, forKey: Self.stateKey)
        if outside { leave(kind) } else if before == "outside" { arrive(kind) }
    }

    /// Plans the reminder for the end of the stay; leaving first cancels it.
    private func arrive(_ kind: PlaceKind, now: Date = Date()) {
        guard on, UIApplication.shared.applicationState != .active else { return }
        let at = now.addingTimeInterval(Arrival.stay)
        let calendar = CalendarStore.shared
        calendar.refresh(now: now)
        let busyNow = calendar.enabled && !calendar.blocked && FreeTime.window(calendar.busy, now: at).busyNow
        let lastReminder = [calendar.lastReminderShown(now: now), Self.lastShown(defaults: defaults, now: now)].compactMap { $0 }.max()
        guard Arrival.shouldRemind(kind, at: at, lastPracticeAt: PracticeStore.lastCompletedAt(), lastReminderAt: lastReminder,
                                   remindedAt: scheduled[kind.rawValue], busyNow: busyNow) else { return }
        var all = scheduled
        all[kind.rawValue] = at
        scheduled = all
        // The free-time reminders keep their three-hour distance from this one.
        calendar.holdBackReminders(until: at.addingTimeInterval(FreeTime.minGapBetweenReminders), now: now)
        let content = UNMutableNotificationContent()
        content.title = "A moment for yourself"
        content.body = Arrival.text(kind)
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: Arrival.stay, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: Self.idPrefix + kind.rawValue, content: content, trigger: trigger))
    }

    private func leave(_ kind: PlaceKind, now: Date = Date()) {
        guard let at = scheduled[kind.rawValue], at > now else { return }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.idPrefix + kind.rawValue])
        var all = scheduled
        all[kind.rawValue] = nil
        scheduled = all
    }

    private func cancelPending(now: Date = Date()) {
        let pending = scheduled.filter { $0.value > now }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: pending.keys.map { Self.idPrefix + $0 })
        scheduled = scheduled.filter { $0.value <= now }
    }

    private var scheduled: [String: Date] {
        get { Self.scheduled(defaults) }
        set { defaults.set(newValue.mapValues(\.timeIntervalSince1970), forKey: Self.scheduledKey) }
    }

    private nonisolated static func scheduled(_ defaults: UserDefaults) -> [String: Date] {
        (defaults.dictionary(forKey: scheduledKey) as? [String: Double] ?? [:]).mapValues { Date(timeIntervalSince1970: $0) }
    }

    /// The latest arrival reminder already shown, for the free-time reminders' distance.
    nonisolated static func lastShown(defaults: UserDefaults = .standard, now: Date = Date()) -> Date? {
        scheduled(defaults).values.filter { $0 <= now }.max()
    }
}

// The manager was made on the main thread, so it calls back there.
extension ArrivalStore: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        MainActor.assumeIsolated {
            if status == .authorizedAlways { finishAsking() }
            if on { needsAlways = status != .authorizedAlways }
        }
    }
}
