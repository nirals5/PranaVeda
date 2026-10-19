import ActivityKit
import Foundation

/// The practice shown on the lock screen and in the Dynamic Island while it
/// runs (a Live Activity). The app starts and updates it; the widget
/// extension draws it (PranaVedaWidgets.swift).
struct PracticeActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable, Sendable {
        /// The pose's name, or the breath phase ("Breathe in").
        var step: String
        /// "Posture 2 of 5", "Cycle 3 of 6".
        var detail: String
        /// When the current step ends; nil while paused.
        var endsAt: Date?
        /// The time left when paused, in seconds.
        var pausedSecondsLeft: Int?
    }

    /// The ritual's or breathwork's name.
    let title: String
    /// "ritual" or "breathwork".
    let kind: String
}
