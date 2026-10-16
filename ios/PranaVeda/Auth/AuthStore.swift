import Foundation
import Observation
import UIKit

/// Optional sign-in. Signed out, the app works exactly as before: a guest whose
/// profile lives on the device. Signed in, Amrita reads and saves the profile
/// in the account (see ChatViewModel), so it is shared with the website.
@MainActor
@Observable
final class AuthStore {
    private(set) var user: AccountUser?
    private(set) var isBusy = false
    /// The last thing that went wrong, worded for the person.
    private(set) var problem: String?

    var isSignedIn: Bool { user != nil }

    /// Called after every successful sign-in, and once per launch for a
    /// restored session: the place to bring the profile in line with the account.
    var onSignedIn: (@MainActor (_ user: AccountUser) async -> Void)?
    /// Called whenever the session ends, by any route.
    var onSignedOut: (@MainActor () -> Void)?

    private let api: APIClient
    private let storage: SessionStorage
    private let google: GoogleIdentityProvider
    private let apple: AppleIdentityProvider
    private let now: () -> Date
    private var accessToken: String?
    private var accessTokenExpiry = Date.distantPast
    private var refreshing: Task<String?, Never>?
    private var restoredThisLaunch = false

    init(api: APIClient = APIClient(), storage: SessionStorage = KeychainSessionStorage(),
         google: GoogleIdentityProvider = GoogleSignInFlow(), apple: AppleIdentityProvider = AppleSignInFlow(),
         now: @escaping () -> Date = Date.init) {
        self.api = api
        self.storage = storage
        self.google = google
        self.apple = apple
        self.now = now
        // A stored session shows as signed in at once, even offline; it is
        // checked with the server in restore().
        if storage.refreshToken != nil { user = storage.user }
    }

    /// At launch: confirms a stored session with the server.
    func restore() async {
        guard isSignedIn, !restoredThisLaunch else { return }
        // Signed in with Apple, then stopped using the Apple ID with
        // PranaVeda (in Settings): Apple asks apps to sign the person out.
        if let appleUserID = storage.appleUserID, await apple.isRevoked(userID: appleUserID) {
            await signOut()
            return
        }
        if await validAccessToken() != nil, let user {
            restoredThisLaunch = true
            await onSignedIn?(user)
        }
    }

    func signInWithGoogle() async {
        await signIn { [api, google] nonce in
            let idToken = try await google.idToken(nonce: nonce)
            return (try await api.signInWithGoogle(idToken: idToken, nonce: nonce, device: Self.deviceDescription()), nil)
        }
    }

    func signInWithApple() async {
        await signIn { [api, apple] nonce in
            let credential = try await apple.credential(nonce: nonce)
            return (try await api.signInWithApple(credential, nonce: nonce, device: Self.deviceDescription()), credential.userID)
        }
    }

    /// One sign-in attempt: a fresh nonce from the server, the provider's
    /// token for it, then the server's session. `attempt` also returns the
    /// person's Apple user id when the provider is Apple.
    private func signIn(_ attempt: (String) async throws -> (SessionResponse, String?)) async {
        guard !isBusy else { return }
        isBusy = true
        problem = nil
        defer { isBusy = false }
        do {
            let nonce = try await api.signInNonce()
            let (session, appleUserID) = try await attempt(nonce)
            adopt(session)
            storage.appleUserID = appleUserID
            restoredThisLaunch = true
            if let user { await onSignedIn?(user) }
        } catch is SignInCancelled {
        } catch let error as AccountError {
            problem = error.localizedDescription
        } catch {
            problem = "Sign-in did not complete. Please check your connection and try again."
        }
    }

    func signOut() async {
        let token = storage.refreshToken
        endSession()
        if let token { try? await api.signOut(refreshToken: token) }
    }

    /// Permanent. Throws (and keeps the person signed in) if the server did
    /// not confirm the deletion.
    func deleteAccount() async throws {
        guard let token = await validAccessToken() else { throw AccountError.sessionEnded }
        try await api.deleteAccount(accessToken: token)
        endSession()
    }

    /// An access token to send with a request, refreshed when it has expired.
    /// Nil when signed out, or when the session turns out to be over.
    func validAccessToken() async -> String? {
        guard isSignedIn else { return nil }
        if let accessToken, accessTokenExpiry.timeIntervalSince(now()) > 30 { return accessToken }
        return await refresh()
    }

    /// The server refused the access token just sent: refresh once. Nil means
    /// the session is over (the caller then carries on signed out).
    func tokenAfterRejection() async -> String? {
        accessToken = nil
        return await refresh()
    }

    private func refresh() async -> String? {
        if let refreshing { return await refreshing.value }
        let task = Task<String?, Never> { [weak self] in
            guard let self, let refreshToken = storage.refreshToken else { return nil }
            do {
                adopt(try await api.refreshSession(refreshToken: refreshToken))
                return accessToken
            } catch AccountError.sessionEnded {
                endSession()
                return nil
            } catch {
                // Offline or the server is unavailable: stay signed in and
                // try again next time.
                return nil
            }
        }
        refreshing = task
        let token = await task.value
        refreshing = nil
        return token
    }

    private func adopt(_ session: SessionResponse) {
        accessToken = session.accessToken
        accessTokenExpiry = now().addingTimeInterval(session.expiresIn)
        storage.refreshToken = session.refreshToken
        if let user = session.user {
            self.user = user
            storage.user = user
        }
    }

    private func endSession() {
        let wasSignedIn = isSignedIn
        storage.refreshToken = nil
        storage.user = nil
        storage.appleUserID = nil
        accessToken = nil
        accessTokenExpiry = .distantPast
        user = nil
        restoredThisLaunch = false
        google.signOut()
        if wasSignedIn { onSignedOut?() }
    }

    static func deviceDescription() -> DeviceDescription {
        var system = utsname()
        uname(&system)
        let machine = withUnsafeBytes(of: &system.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        let model = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? machine
        return DeviceDescription(
            deviceClass: UIDevice.current.userInterfaceIdiom == .pad ? "tablet" : "phone",
            osVersion: UIDevice.current.systemVersion,
            deviceModel: model,
            appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        )
    }
}
