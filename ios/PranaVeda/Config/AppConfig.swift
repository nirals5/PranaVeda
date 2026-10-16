import Foundation

enum AppConfig {
    /// The PranaVeda API, from the PV_API_BASE_URL build setting.
    static let apiBaseURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "PVAPIBaseURL") as? String
        return URL(string: raw ?? "") ?? URL(string: "http://localhost:3000")!
    }()

    /// Whether this build can Sign in with Apple. It needs a paid Apple
    /// Developer team, so it is off unless PV_APPLE_SIGN_IN = YES.
    static let appleSignInEnabled: Bool =
        (Bundle.main.object(forInfoDictionaryKey: "PVAppleSignInEnabled") as? String) == "YES"

    /// Image addresses from the API are either full addresses or paths on the
    /// API's own site ("/poses/cobra.jpg"); paths are resolved against it.
    static func resolve(_ address: String?, base: URL = apiBaseURL) -> URL? {
        guard let address, !address.isEmpty else { return nil }
        if address.hasPrefix("/") { return URL(string: address, relativeTo: base)?.absoluteURL }
        return URL(string: address)
    }
}
