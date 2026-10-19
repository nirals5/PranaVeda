import AppIntents
import Foundation
import Observation

/// "Talk to Amrita" from Control Center, the lock screen or the Action button.
/// It runs in the app (openAppWhenRun), which opens and starts listening: a
/// control can't reliably open the app's own pranaveda:// link itself.
struct TalkToAmritaIntent: AppIntent {
    static let title: LocalizedStringResource = "Talk to Amrita"
    static let description = IntentDescription("Opens PranaVeda ready to listen.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppLinkRouter.shared.pending = WidgetLink.talk
        return .result()
    }
}

/// Hands a link from an intent to the app's screens, which follow it as if it
/// had been opened as a URL.
@MainActor @Observable
final class AppLinkRouter {
    static let shared = AppLinkRouter()
    var pending: URL?
}
