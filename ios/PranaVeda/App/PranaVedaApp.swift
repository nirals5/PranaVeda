import GoogleSignIn
import SwiftUI

@main
struct PranaVedaApp: App {
    @State private var chat = ChatViewModel()
    @State private var catalog = CatalogStore()
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            TabView {
                ChatView(model: chat, auth: auth)
                    .tabItem { Label("Amrita", systemImage: "sparkles") }
                LibraryView(catalog: catalog)
                    .tabItem { Label("Library", systemImage: "figure.mind.and.body") }
                AccountView(auth: auth)
                    .tabItem { Label("You", systemImage: "person.crop.circle") }
            }
            .tint(Theme.lavenderDeep)
            .onOpenURL { url in GIDSignIn.sharedInstance.handle(url) }
            .task {
                chat.auth = auth
                auth.onSignedIn = { [chat] user in await chat.adoptAccountProfile(for: user) }
                auth.onSignedOut = { [chat] in chat.handBackDevice() }
                await auth.restore()
            }
            .task { await catalog.loadIfNeeded() }
        }
    }
}
