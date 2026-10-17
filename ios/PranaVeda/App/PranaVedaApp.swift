import GoogleSignIn
import SwiftUI

@main
struct PranaVedaApp: App {
    @State private var chat = ChatViewModel()
    @State private var catalog = CatalogStore()
    @State private var auth = AuthStore()
    @State private var doshaGuide = DoshaGuideStore()
    @State private var practice = PracticeStore()
    @State private var insight = DailyInsightStore()
    @State private var saved = SavedRitualStore()
    @State private var tab = AppTab.amrita

    enum AppTab: Hashable { case amrita, dosha, library, you }

    var body: some Scene {
        WindowGroup {
            TabView(selection: $tab) {
                ChatView(model: chat, auth: auth, insight: insight, saved: saved)
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
                AccountView(auth: auth, practice: practice, saved: saved) { tab = .amrita }
                    .tabItem { Label("You", systemImage: "person.crop.circle") }
                    .tag(AppTab.you)
            }
            .tint(Theme.lavenderDeep)
            // Every screen that can finish a practice logs it here, and every
            // ritual can be saved.
            .environment(practice)
            .environment(saved)
            .onOpenURL { url in GIDSignIn.sharedInstance.handle(url) }
            .task {
                chat.auth = auth
                practice.auth = auth
                auth.onSignedIn = { [chat, practice] user in
                    await chat.adoptAccountProfile(for: user)
                    await practice.adoptAccount(user)
                }
                auth.onSignedOut = { [chat, practice] in
                    chat.handBackDevice()
                    practice.handBackDevice()
                }
                await auth.restore()
            }
            .task { await catalog.loadIfNeeded() }
        }
    }
}
