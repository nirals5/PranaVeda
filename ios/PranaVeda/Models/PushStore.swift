import Foundation
import Observation
import UIKit

/// Free-time nudges sent by the server through Apple's push service (KAN-31).
/// The server's nudge check already reaches the website and Alexa; with the
/// phone registered, one opening is one nudge wherever it lands. While it
/// works, the phone plans no free-time reminders of its own (they would come
/// twice); signed out, or with push unavailable, the phone plans them as
/// before. Arrival reminders always stay on the phone.
enum PushNudges {
    /// Where a server nudge opens, as on the website.
    static let url = "/?nudge=1"

    /// APNs's sandbox for builds signed for development (a profile is inside
    /// the app), the live service for TestFlight and the App Store (none is).
    static func environment(provision: Data? = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision").flatMap { try? Data(contentsOf: $0) }) -> String {
        guard let provision,
              let start = provision.range(of: Data("<?xml".utf8)),
              let end = provision.range(of: Data("</plist>".utf8), in: start.lowerBound..<provision.endIndex),
              let plist = try? PropertyListSerialization.propertyList(from: provision[start.lowerBound..<end.upperBound], format: nil) as? [String: Any],
              let entitlements = plist["Entitlements"] as? [String: Any]
        else { return "production" }
        return entitlements["aps-environment"] as? String == "development" ? "sandbox" : "production"
    }

    static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }

    static func isServerNudge(_ userInfo: [AnyHashable: Any]) -> Bool {
        userInfo["url"] as? String == url
    }

    /// What the server needs from the calendar, as the website sends it:
    /// busy start and end times only, never what an event is.
    struct CalendarUpload: Encodable, Equatable {
        let trusted: Bool
        let google = false
        let busy: [[Double]]?
        let coveredUntil: Double?
    }

    static func calendarUpload(trusted: Bool, busy: [BusyInterval], now: Date = Date(), calendar: Calendar = .current) -> CalendarUpload {
        guard trusted else { return CalendarUpload(trusted: false, busy: nil, coveredUntil: nil) }
        let until = calendar.date(byAdding: .day, value: 2, to: calendar.startOfDay(for: now))!
        return CalendarUpload(
            trusted: true,
            busy: busy.map { [$0.start.timeIntervalSince1970 * 1000, $0.end.timeIntervalSince1970 * 1000] },
            coveredUntil: until.timeIntervalSince1970 * 1000
        )
    }
}

@MainActor
@Observable
final class PushStore {
    static let shared = PushStore()

    /// The server sends this phone's free-time nudges.
    private(set) var serverNudges: Bool

    @ObservationIgnored weak var auth: AuthStore?
    private let api: APIClient
    private let defaults: UserDefaults

    private nonisolated static let serverKey = "pranaveda_server_nudges"
    private static let tokenKey = "pranaveda_push_token"

    init(api: APIClient = APIClient(), defaults: UserDefaults = .standard) {
        self.api = api
        self.defaults = defaults
        serverNudges = Self.serverNudges(defaults: defaults)
    }

    nonisolated static func serverNudges(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: serverKey)
    }

    nonisolated static func setServerNudges(_ on: Bool, defaults: UserDefaults = .standard) {
        if on { defaults.set(true, forKey: serverKey) } else { defaults.removeObject(forKey: serverKey) }
    }

    /// Signed in with free-time reminders on: ask iOS for this phone's push
    /// address (each launch, as Apple asks); otherwise stop.
    func update(wanted: Bool) async {
        if wanted {
            UIApplication.shared.registerForRemoteNotifications()
        } else {
            await stop()
        }
    }

    /// From iOS: the phone's address, handed to the server.
    func registered(_ token: Data) async {
        guard let auth, let bearer = await auth.validAccessToken() else { return }
        let hex = PushNudges.hex(token)
        do {
            try await api.push(method: "PUT", path: "api/push/device", body: ["token": hex, "environment": PushNudges.environment()], accessToken: bearer)
            defaults.set(hex, forKey: Self.tokenKey)
            setServer(true)
            // Busy times straight away, so the first nudge needn't wait for the screen to change.
            await report(seen: UIApplication.shared.applicationState == .active)
        } catch {
            // Offline: the phone keeps planning its own until the next launch.
            setServer(false)
        }
    }

    /// No push for this build (signed with a personal team, say): the phone plans its own.
    func registrationFailed() {
        setServer(false)
    }

    /// Before signing out, or with free-time reminders turned off.
    func stop() async {
        if let token = defaults.string(forKey: Self.tokenKey), let bearer = await auth?.validAccessToken() {
            try? await api.push(method: "DELETE", path: "api/push/device", body: ["token": token], accessToken: bearer)
        }
        forget()
    }

    /// Signed out without a word to the server (the session had ended):
    /// iOS drops the address, so Apple tells the server it's gone.
    func forget() {
        guard defaults.string(forKey: Self.tokenKey) != nil || serverNudges else { return }
        defaults.removeObject(forKey: Self.tokenKey)
        UIApplication.shared.unregisterForRemoteNotifications()
        setServer(false)
    }

    /// Keeps the server told of the calendar's busy times and whether the
    /// app is on screen (no nudge then), as the website does.
    func report(seen: Bool, calendar: CalendarStore = .shared) async {
        guard serverNudges, let bearer = await auth?.validAccessToken() else { return }
        struct Body: Encodable { let seen: Bool; let calendar: PushNudges.CalendarUpload }
        let trusted = calendar.enabled && !calendar.blocked && calendar.readAt != nil
        let body = Body(seen: seen, calendar: PushNudges.calendarUpload(trusted: trusted, busy: calendar.busy))
        try? await api.push(method: "PUT", path: "api/push/state", body: body, accessToken: bearer)
    }

    private func setServer(_ on: Bool) {
        guard on != serverNudges else { return }
        serverNudges = on
        Self.setServerNudges(on, defaults: defaults)
        // Planned ones would arrive alongside the server's.
        if on { CalendarStore.shared.standDown() }
    }
}

extension APIClient {
    func push(method: String, path: String, body: some Encodable, accessToken: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (_, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw APIError.http(status) }
    }
}

/// iOS hands the push address to the app delegate only.
final class PushAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in await PushStore.shared.registered(deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        Task { @MainActor in PushStore.shared.registrationFailed() }
    }
}
