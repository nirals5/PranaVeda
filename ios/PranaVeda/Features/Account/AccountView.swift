import AuthenticationServices
import GoogleSignInSwift
import SwiftUI

/// Optional sign-in, and the account once signed in.
struct AccountView: View {
    let auth: AuthStore
    let practice: PracticeStore
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
                        PracticeHistoryView(practice: practice)
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
            Text("Guest").font(Theme.heading(.title)).foregroundStyle(Theme.ink)
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
            GoogleSignInButton(viewModel: GoogleSignInButtonViewModel(scheme: .light, style: .wide, state: auth.isBusy ? .disabled : .normal)) {
                notice = nil
                Task { await auth.signInWithGoogle() }
            }
            .frame(maxWidth: 320)
        }
        .cardSurface()
    }

    private func signedIn(_ user: AccountUser) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Signed in").sectionLabel()
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
