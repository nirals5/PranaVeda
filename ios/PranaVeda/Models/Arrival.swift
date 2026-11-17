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

    /// iOS keeps a watched place's centre a little off the one it was given
    /// (about 23 m on an iPhone), so a place counts as moved only beyond this.
    static let sameCentreMetres: CLLocationDistance = 100

    static func sameCentre(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Bool {
        CLLocation(latitude: a.latitude, longitude: a.longitude)
            .distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude)) <= sameCentreMetres
    }

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
        heldBack(kind, at: at, lastPracticeAt: lastPracticeAt, lastReminderAt: lastReminderAt,
                 remindedAt: remindedAt, busyNow: busyNow, calendar: calendar) == nil
    }

    /// Why a reminder may not show `at`, or nil when it may.
    static func heldBack(
        _ kind: PlaceKind, at: Date, lastPracticeAt: Date?, lastReminderAt: Date?,
        remindedAt: Date?, busyNow: Bool, calendar: Calendar = .current
    ) -> String? {
        guard kinds.contains(kind) else { return "not a place for reminders" }
        if busyNow { return "busy on the calendar" }
        guard FreeTime.wakingHours.contains(calendar.component(.hour, from: at)) else { return "outside waking hours" }
        if let lastPracticeAt, at.timeIntervalSince(lastPracticeAt) < FreeTime.restAfterPractice { return "practised recently" }
        if let lastReminderAt, at.timeIntervalSince(lastReminderAt) < FreeTime.minGapBetweenReminders { return "another reminder within 3 hours" }
        if let remindedAt, calendar.isDate(remindedAt, inSameDayAs: at) { return "already reminded today" }
        return nil
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
    @ObservationIgnored private var syncing: Task<Void, Never>?
    /// Waiting for the answer to "Always".
    @ObservationIgnored private var askingForAlways: CheckedContinuation<Void, Never>?

    private static let onKey = "pranaveda_arrival_reminders"
    /// Place → "inside" or "outside", as last reported; a reminder only on a move from outside to inside.
    private static let stateKey = "pranaveda_arrival_state"
    /// Place → when its latest reminder shows (seconds since 1970).
    private nonisolated static let scheduledKey = "pranaveda_arrival_scheduled"
    nonisolated static let idPrefix = "arrival-"
    /// The CLMonitor that watched the places before (KAN-36). Letters only:
    /// CoreLocation refuses a name with a hyphen.
    private static let monitorName = "PranaVedaArrivals"
    /// Set once that monitor's watches are removed.
    private static let monitorRetiredKey = "pranaveda_arrival_monitor_retired"

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

    // Watched with region monitoring, not CLMonitor: on an iPhone, CLMonitor
    // reported arrivals but never once reported leaving, even 30 miles away
    // for most of a day, so no arrival could count (KAN-36).
    private func syncNow() async {
        await retireMonitor()
        let places = on && defaults.bool(forKey: PlaceStore.enabledKey) ? PlaceStore.savedPlaces(defaults: defaults).filter { Arrival.kinds.contains($0.kind) } : []
        let wanted = Dictionary(uniqueKeysWithValues: places.map { ($0.kind.rawValue, $0) })
        let watched = manager.monitoredRegions.compactMap { $0 as? CLCircularRegion }.filter { PlaceKind(rawValue: $0.identifier) != nil }
        var states = defaults.dictionary(forKey: Self.stateKey) as? [String: String] ?? [:]
        for region in watched where wanted[region.identifier] == nil {
            manager.stopMonitoring(for: region)
            states[region.identifier] = nil
        }
        for (id, place) in wanted {
            let center = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lon)
            if let current = watched.first(where: { $0.identifier == id }), Arrival.sameCentre(current.center, center) {
                // Asks where they are now, in case a move was missed while closed.
                manager.requestState(for: current)
                continue
            }
            // New or moved: its first report says where they are, not an arrival.
            let region = CLCircularRegion(center: center, radius: Arrival.radiusMetres, identifier: id)
            region.notifyOnEntry = true
            region.notifyOnExit = true
            manager.startMonitoring(for: region)
            states[id] = nil
        }
        defaults.set(states, forKey: Self.stateKey)
        if !on { cancelPending() }
    }

    /// Removes the old CLMonitor watches once, so iOS stops waking the app for them.
    private func retireMonitor() async {
        guard !defaults.bool(forKey: Self.monitorRetiredKey) else { return }
        let monitor = await CLMonitor(Self.monitorName)
        for id in await monitor.identifiers { await monitor.remove(id) }
        defaults.set(true, forKey: Self.monitorRetiredKey)
    }

    /// From the location manager: where they are against a watched place.
    fileprivate func regionState(_ id: String, _ state: CLRegionState) {
        handle(id, inside: state == .inside, outside: state == .outside)
    }

    private func handle(_ id: String, inside: Bool, outside: Bool) {
        guard inside || outside, let kind = PlaceKind(rawValue: id) else { return }
        var states = defaults.dictionary(forKey: Self.stateKey) as? [String: String] ?? [:]
        let before = states[id]
        states[id] = inside ? "inside" : "outside"
        defaults.set(states, forKey: Self.stateKey)
        // A wake-up from iOS: catch calendar changes first, then plan this
        // place's reminder, which holds the free-time ones back (KAN-29).
        CalendarStore.shared.replanInBackground()
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

    /// Arrival reminders planned but not yet shown.
    nonisolated static func pending(defaults: UserDefaults = .standard, now: Date = Date()) -> [Date] {
        scheduled(defaults).values.filter { $0 > now }
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

    /// Called on every crossing, and for each requestState; iOS relaunches the
    /// app for a crossing while it's closed.
    nonisolated func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        let id = region.identifier
        MainActor.assumeIsolated { regionState(id, state) }
    }

    /// The first report, right after a place is added.
    nonisolated func locationManager(_ manager: CLLocationManager, didStartMonitoringFor region: CLRegion) {
        manager.requestState(for: region)
    }
}
