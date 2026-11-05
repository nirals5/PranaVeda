import AppIntents

/// Siri and Spotlight phrases, ready without setup. "Amrita" is also the app's
/// name to Siri (INAlternativeAppNames), so "Talk to Amrita" works on its own.
struct PranaVedaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TalkToAmritaIntent(),
            phrases: [
                "Talk to \(.applicationName)",
                "Ask \(.applicationName)",
                "Open \(.applicationName) and listen",
            ],
            shortTitle: "Talk to Amrita",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: StartPracticeIntent(),
            phrases: [
                "Start my practice in \(.applicationName)",
                "Start my \(.applicationName) practice",
                "Begin my practice with \(.applicationName)",
                "Start \(\.$ritual) in \(.applicationName)",
                "Practice \(\.$ritual) with \(.applicationName)",
            ],
            shortTitle: "Start My Practice",
            systemImageName: "figure.yoga"
        )
        AppShortcut(
            intent: PracticeSummaryIntent(),
            phrases: [
                "How's my \(.applicationName) streak",
                "My \(.applicationName) practice summary",
                "How much have I practiced with \(.applicationName)",
            ],
            shortTitle: "Practice Summary",
            systemImageName: "flame"
        )
    }
}
