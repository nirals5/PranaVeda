import Foundation
import Security

/// Where a signed-in session is kept between launches: the refresh token in
/// the Keychain (never in UserDefaults or files), and the account's public
/// details alongside, so the app shows the person as signed in straight away,
/// even offline. Access tokens live in memory only; they last 15 minutes.
protocol SessionStorage: AnyObject, Sendable {
    var refreshToken: String? { get set }
    var user: AccountUser? { get set }
}

final class KeychainSessionStorage: SessionStorage, @unchecked Sendable {
    private let service = "com.pranaveda.app.session"
    private let account = "refreshToken"
    private let userKey = "pranaveda_account_user"

    var refreshToken: String? {
        get {
            var item: CFTypeRef?
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecReturnData as String: true,
            ]
            guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
            ]
            SecItemDelete(query as CFDictionary)
            guard let newValue, let data = newValue.data(using: .utf8) else { return }
            var attributes = query
            attributes[kSecValueData as String] = data
            // Readable once the phone has been unlocked after a restart; never
            // copied to another device or into backups.
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(attributes as CFDictionary, nil)
        }
    }

    var user: AccountUser? {
        get { UserDefaults.standard.data(forKey: userKey).flatMap { try? JSONDecoder().decode(AccountUser.self, from: $0) } }
        set {
            if let newValue, let data = try? JSONEncoder().encode(newValue) { UserDefaults.standard.set(data, forKey: userKey) }
            else { UserDefaults.standard.removeObject(forKey: userKey) }
        }
    }
}

/// For tests and previews.
final class InMemorySessionStorage: SessionStorage, @unchecked Sendable {
    var refreshToken: String?
    var user: AccountUser?
    init(refreshToken: String? = nil, user: AccountUser? = nil) {
        self.refreshToken = refreshToken
        self.user = user
    }
}
