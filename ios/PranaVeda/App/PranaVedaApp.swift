import GoogleSignIn
import SwiftUI
import UIKit

@main
struct PranaVedaApp: App {
    @State private var chat = ChatViewModel()
    @State private var catalog = CatalogStore()
    @State private var auth = AuthStore()
    @State private var doshaGuide = DoshaGuideStore()
    @State private var practice = PracticeStore()
    @State private var insight = DailyInsightStore()
    @State private var saved = SavedRitualStore()
    @State private var voice = AmritaVoice()
    @State private var health = HealthStore()
    @State private var place = PlaceStore()
    @State private var calendar = CalendarStore.shared
    @State private var tab = AppTab.amrita
    /// Raised by the widgets' "Talk to Amrita": the chat starts listening.
    @State private var voiceRequest = 0
    /// A saved ritual opened from a widget.
    @State private var openedRitual: SavedRitual?
    /// A saved ritual begun straight away ("Start my practice").
    @State private var practicingRitual: SavedRitual?
    /// Links from intents (the Talk to Amrita control).
    @State private var router = AppLinkRouter.shared
    /// "Hey Amrita" while the app is open (opt-in).
    @State private var heyAmrita = HeyAmrita.shared
    @Environment(\.scenePhase) private var scenePhase

    enum AppTab: Hashable { case amrita, dosha, library, you }

    init() {
        // Screen titles in the serif, like headings everywhere else. Scaled
        // with the reader's text size, as the system's own titles are.
        func playfair(_ size: CGFloat, _ style: UIFont.TextStyle) -> UIFont? {
            UIFont(name: "PlayfairDisplay-Regular", size: size).map { UIFontMetrics(forTextStyle: style).scaledFont(for: $0) }
        }
        let bar = UINavigationBar.appearance()
        if let large = playfair(34, .largeTitle) { bar.largeTitleTextAttributes = [.font: large] }
        if let inline = playfair(19, .headline) { bar.titleTextAttributes = [.font: inline] }
        // Must be registered before launch finishes.
        CalendarStore.registerBackgroundRefresh()
    }

    var body: some Scene {
        WindowGroup {
            TabView(selection: $tab) {
                ChatView(model: chat, auth: auth, insight: insight, saved: saved, voice: voice, place: place, calendar: calendar, voiceRequest: voiceRequest)
                    .tabItem { Label("Ask Amrita", systemImage: "sparkles") }
                    .tag(AppTab.amrita)
                DoshaProfileView(profile: chat.profile, guide: doshaGuide) { message in
                    // As on the website: over to the chat, with the question asked.
                    tab = .amrita
                    chat.send(message)
                }
                    .tabItem { Label("Dosha", systemImage: "wind") }
                    .tag(AppTab.dosha)
                LibraryView(catalog: catalog)
                    .tabItem { Label("Library", systemImage: "figure.mind.and.body") }
                    .tag(AppTab.library)
                AccountView(auth: auth, practice: practice, saved: saved, health: health, place: place, calendar: calendar, chat: chat) { tab = .amrita }
                    .tabItem { Label("You", systemImage: "person.crop.circle") }
                    .tag(AppTab.you)
            }
            .tint(Theme.lavenderDeep)
            // Every screen that can finish a practice logs it here, and every
            // ritual can be saved.
            .environment(practice)
            .environment(saved)
            .onOpenURL { url in
                if url.scheme == WidgetLink.scheme { open(url) } else { GIDSignIn.sharedInstance.handle(url) }
            }
            // Listens on the Amrita tab (practice screens hand it their own
            // commands), never in the background or over Amrita's own voice.
            .onChange(of: tab == .amrita && openedRitual == nil, initial: true) { _, showing in heyAmrita.chatShowing = showing }
            .onChange(of: scenePhase, initial: true) { _, phase in
                heyAmrita.hold(.background, phase != .active)
                // This morning's readings, ready for the next message to Amrita.
                if phase == .active { Task { await health.load() } }
                // Where they are is checked only while the app is on screen.
                place.setActive(phase == .active)
                // Free time is read on screen; reminders are planned on leaving.
                if phase != .inactive { calendar.setActive(phase == .active) }
            }
            .onChange(of: voice.isSpeaking) { _, speaking in heyAmrita.hold(.replying, speaking) }
            .onChange(of: router.pending, initial: true) {
                guard let url = router.pending else { return }
                router.pending = nil
                open(url)
            }
            .sheet(item: $openedRitual) { RitualDetailView(result: $0.result) }
            .fullScreenCover(item: $practicingRitual) {
                GuidedPracticeView(result: $0.result).environment(practice).environment(saved)
            }
            // The widgets show what the app knows; keep them in step.
            .onChange(of: practice.entries, initial: true) { publishToWidgets() }
            .onChange(of: saved.rituals) { publishToWidgets() }
            .onChange(of: insight.state) { publishToWidgets() }
            .task {
                chat.auth = auth
                chat.speakReply = { [voice] in voice.speak($0) }
                chat.stopSpeaking = { [voice] in voice.stop() }
                chat.healthForAmrita = { [health] in health.summaryForAmrita() }
                chat.locationForAmrita = { [place] in place.contextForAmrita }
                chat.calendarForAmrita = { [calendar] in calendar.contextForAmrita }
                calendar.lastPracticeAt = { [practice] in practice.entries.last?.completedDate }
                calendar.onOpenReminder = { tab = .amrita }
                heyAmrita.onWake = { open(WidgetLink.talk) }
                practice.auth = auth
                saved.auth = auth
                auth.onSignedIn = { [chat, practice, saved] user in
                    await chat.adoptAccountProfile(for: user)
                    await practice.adoptAccount(user)
                    await saved.adoptAccount(user)
                }
                auth.onSignedOut = { [chat, practice, saved] in
                    chat.handBackDevice()
                    practice.handBackDevice()
                    saved.handBackDevice()
                }
                await auth.restore()
            }
            .task { await catalog.loadIfNeeded() }
        }
    }

    private func publishToWidgets() {
        WidgetBridge.publish(entries: practice.entries, saved: saved.rituals, insight: insight.state)
    }

    /// pranaveda://talk, pranaveda://you, pranaveda://ritual/<id>, pranaveda://practice
    private func open(_ url: URL) {
        switch url.host() {
        case "talk":
            tab = .amrita
            voiceRequest += 1
        case "you":
            tab = .you
        case "practice":
            openedRitual = nil
            if let newest = saved.rituals.first { practicingRitual = newest } else { tab = .library }
        case "ritual":
            let id = url.lastPathComponent
            if let ritual = saved.rituals.first(where: { $0.id == id }) { openedRitual = ritual } else { tab = .you }
        default:
            break
        }
    }
}
