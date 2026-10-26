import AuthenticationServices
import GoogleSignInSwift
import SwiftUI

/// Optional sign-in, and the account once signed in.
struct AccountView: View {
    let auth: AuthStore
    let practice: PracticeStore
    let saved: SavedRitualStore
    var health: HealthStore? = nil
    /// Holds the wellness profile, where the experience setting lives.
    var chat: ChatViewModel? = nil
    /// Over to the chat ("Begin with Amrita" on the calendar).
    var onBegin: () -> Void = {}
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var notice: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if let user = auth.user { signedIn(user) } else { signedOut }
                        if let chat { ExperienceSetting(chat: chat) }
                        PracticeCalendarView(practice: practice, onBegin: onBegin)
                        PracticeTrendsView(practice: practice, health: health)
                        SavedRitualsView(saved: saved)
                        if let message = auth.problem ?? notice {
                            Text(message).font(Theme.bodySmall).foregroundStyle(Theme.terracotta)
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("You")
        }
    }

    private var signedOut: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Guest").font(Theme.heading(.title)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            Text("Signing in is optional. It saves the wellness profile Amrita builds to your account, so it follows you to the website and your other devices.")
                .font(Theme.body)
                .foregroundStyle(Theme.stone700)
            // Apple's guidelines ask for its button to be at least as prominent
            // as other sign-in options. Only in builds that can use it.
            if AppConfig.appleSignInEnabled {
                AppleSignInButton {
                    notice = nil
                    Task { await auth.signInWithApple() }
                }
                .frame(maxWidth: 320, minHeight: 44, maxHeight: 50)
                .disabled(auth.isBusy)
                .accessibilityLabel("Sign in with Apple")
            }
            // Google's button has a fixed design that cuts its text off at the
            // largest sizes, so it grows only to the first accessibility size.
            GoogleSignInButton(viewModel: GoogleSignInButtonViewModel(scheme: .light, style: .wide, state: auth.isBusy ? .disabled : .normal)) {
                notice = nil
                Task { await auth.signInWithGoogle() }
            }
            .frame(maxWidth: 320)
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        }
        .cardSurface()
    }

    private func signedIn(_ user: AccountUser) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Signed in").sectionLabel().accessibilityAddTraits(.isHeader)
            Text(user.displayName ?? user.email ?? "Your account").font(Theme.heading(.title)).foregroundStyle(Theme.ink)
            if user.displayName != nil, let email = user.email {
                Text(email).font(Theme.bodySmall).foregroundStyle(Theme.stone500)
            }
            Text("Your wellness profile is saved to your account and shared with the website.")
                .font(Theme.body)
                .foregroundStyle(Theme.stone700)
            Button("Sign out") { Task { await auth.signOut() } }
                .font(Theme.body.weight(.medium))
                .padding(.top, 4)
            Button("Delete account", role: .destructive) { confirmingDelete = true }
                .font(Theme.bodySmall)
                .disabled(deleting)
                .confirmationDialog("Delete your PranaVeda account?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                    Button("Delete account", role: .destructive) {
                        Task {
                            deleting = true
                            do {
                                try await auth.deleteAccount()
                                notice = "Your account has been deleted."
                            } catch {
                                notice = "Your account could not be deleted just now. Please try again."
                            }
                            deleting = false
                        }
                    }
                } message: {
                    Text("Your account, your sign-in and the wellness profile saved to it are removed from our servers for good, and you are signed out on every device. This phone goes back to how it was before you signed in.")
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}

/// Apple's own "Sign in with Apple" button. SwiftUI's version runs Apple's
/// request itself; this one only reports the tap, so the app can first fetch
/// the server's nonce for the request.
private struct AppleSignInButton: UIViewRepresentable {
    let action: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: .signIn, style: .black)
        button.cornerRadius = 8
        button.addTarget(context.coordinator, action: #selector(Coordinator.tapped), for: .touchUpInside)
        return button
    }

    func updateUIView(_ button: ASAuthorizationAppleIDButton, context: Context) {
        context.coordinator.action = action
    }

    @MainActor
    final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func tapped() { action() }
    }
}

/// How much yoga they have practised. Amrita records it from what they tell
/// her; it can be changed here too. Only "Experienced" unlocks the few
/// practices offered to experienced practitioners (G2).
struct ExperienceSetting: View {
    let chat: ChatViewModel
    @State private var saving = false
    @State private var problem: String?

    private static let choices: [(value: String?, label: String)] = [
        (nil, "Not set"), ("beginner", "Beginner"), ("regular", "Regular"), ("experienced", "Experienced"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your experience").sectionLabel().accessibilityAddTraits(.isHeader)
            Picker("Your experience", selection: Binding(get: { chat.experience ?? "" }, set: choose)) {
                ForEach(Self.choices, id: \.label) { choice in
                    Text(choice.label).tag(choice.value ?? "")
                }
            }
            .pickerStyle(.segmented)
            .disabled(saving)
            Text("A few demanding practices are offered only to experienced practitioners. Amrita also updates this when you tell her.")
                .font(Theme.bodySmall)
                .foregroundStyle(Theme.stone700)
            if let problem {
                Text(problem).font(Theme.bodySmall).foregroundStyle(Theme.terracotta)
            }
        }
        .cardSurface()
    }

    private func choose(_ tag: String) {
        let value = tag.isEmpty ? nil : tag
        guard value != chat.experience, !saving else { return }
        saving = true
        problem = nil
        Task {
            if await !chat.changeExperience(value) { problem = "That didn’t save. Check your connection and try again." }
            saving = false
        }
    }
}
