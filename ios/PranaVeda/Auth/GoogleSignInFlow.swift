import GoogleSignIn
import UIKit

/// Asks Google who the person is, and returns Google's signed ID token. The
/// server verifies it (and the nonce in it) before creating a session.
@MainActor
protocol GoogleIdentityProvider {
    func idToken(nonce: String) async throws -> String
    func signOut()
}

/// The person closed Google's sign-in sheet: a choice, not an error.
struct SignInCancelled: Error {}

@MainActor
struct GoogleSignInFlow: GoogleIdentityProvider {
    func idToken(nonce: String) async throws -> String {
        guard let presenter = Self.topViewController() else { throw AccountError.unavailable(0) }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(
                withPresenting: presenter, hint: nil, additionalScopes: nil, nonce: nonce
            )
            guard let token = result.user.idToken?.tokenString else { throw AccountError.unavailable(0) }
            return token
        } catch let error as NSError where error.domain == kGIDSignInErrorDomain && error.code == GIDSignInError.canceled.rawValue {
            throw SignInCancelled()
        }
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }

    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive } ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
