import Foundation

/// What this phone knew before sign-in that the account doesn't. Signed in, the
/// account is the profile, so without this a condition entered only here would
/// quietly stop reaching Amrita. Nothing moves until the person says yes: the
/// details could be someone else's, and they can be about health. Same rules
/// as the website (src/lib/profileOffer.ts).
struct ProfileOffer: Equatable {
    /// What to show, in order: conditions first.
    let items: [String]
    /// How many of them are health conditions.
    let health: Int
    /// Identifies this offer, so "Not now" holds until the phone's copy changes.
    let key: String

    /// The server's limit on each list (api/_lib/profileSchema.ts).
    private static let maxItems = 60

    private static func same(_ text: String) -> String {
        text.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased()
    }

    private static func blank(_ value: JSONValue?) -> Bool {
        switch value {
        case nil, .null, .string(""): true
        default: false
        }
    }

    private static func strings(_ value: JSONValue?) -> [String] {
        guard case .array(let items) = value else { return [] }
        return items.compactMap(\.stringValue)
    }

    private static func entries(_ value: JSONValue?) -> [JSONValue] {
        guard case .array(let items) = value else { return [] }
        return items
    }

    private static func missing(from account: [String], device: [String]) -> [String] {
        var seen = Set(account.map(same))
        var result: [String] = []
        for item in device {
            let key = same(item)
            if key.isEmpty || !seen.insert(key).inserted { continue }
            result.append(item.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return result
    }

    /// The offer, or nil when the account already has everything worth asking
    /// about. Observations and practice history are Amrita's notes rather than
    /// something the person entered, so alone they don't prompt a question.
    static func make(device: JSONValue?, account: JSONValue) -> ProfileOffer? {
        guard let device else { return nil }
        let conditions = missing(from: strings(account["conditions"]), device: strings(device["conditions"]))
        var items = conditions
        items += missing(from: strings(account["goals"]), device: strings(device["goals"])).map { "Goal: \($0)" }
        items += missing(from: strings(account["preferences"]), device: strings(device["preferences"])).map { "Preference: \($0)" }
        func single(_ field: String, _ label: String, _ text: (JSONValue) -> String?) {
            guard blank(account[field]), !blank(device[field]), let value = device[field], let shown = text(value) else { return }
            items.append("\(label): \(shown)")
        }
        single("name", "Name") { $0.stringValue }
        single("prakriti", "Constitution") { $0.stringValue }
        single("vikriti", "Current imbalance") { $0.stringValue }
        single("doshaProfile", "Dosha result") { $0["primary"]?.stringValue }
        single("experience", "Experience") { $0.stringValue?.capitalized }
        guard !items.isEmpty else { return nil }
        return ProfileOffer(items: items, health: conditions.count, key: items.map(same).sorted().joined(separator: "\n"))
    }

    /// "1 health detail", or "3 details, including health details", and so on.
    var summary: String {
        let count = items.count
        let what: String
        if health == count {
            what = "\(count) health \(count == 1 ? "detail" : "details")"
        } else {
            what = "\(count) \(count == 1 ? "detail" : "details")\(health > 0 ? ", including health details," : "")"
        }
        return "This device has \(what) your account doesn't have."
    }

    /// The account's profile with this phone's details added. Nothing the
    /// account already has is changed or removed.
    static func merge(device: JSONValue, account: JSONValue) -> JSONValue {
        var merged: [String: JSONValue] = [:]
        if case .object(let fields) = account { merged = fields }
        for list in ["conditions", "goals", "preferences"] {
            let current = entries(account[list])
            let added = missing(from: strings(account[list]), device: strings(device[list]))
            if !added.isEmpty { merged[list] = .array(Array((current + added.map(JSONValue.string)).prefix(maxItems))) }
        }
        for field in ["name", "vikriti", "doshaProfile", "experience"] where blank(account[field]) && !blank(device[field]) {
            merged[field] = device[field]
        }
        if blank(account["prakriti"]), !blank(device["prakriti"]) {
            merged["prakriti"] = device["prakriti"]
            if let confidence = device["prakritiConfidence"], !blank(confidence) { merged["prakritiConfidence"] = confidence }
        }
        for list in ["observations", "practiceHistory"] {
            var current = entries(account[list])
            var seen = Set(current)
            for entry in entries(device[list]) where current.count < maxItems && seen.insert(entry).inserted {
                current.append(entry)
            }
            if !current.isEmpty { merged[list] = .array(current) }
        }
        return .object(merged)
    }

    /// Adds the details starting from the account's latest copy. If another
    /// device saved first, the save returns theirs with the details still
    /// missing, so it tries once more on that. The stored profile on success.
    @MainActor static func add(
        device: JSONValue,
        load: () async throws -> VersionedProfile,
        save: (JSONValue, Int) async throws -> VersionedProfile
    ) async throws -> JSONValue? {
        var account = try await load()
        for _ in 0..<2 {
            let saved = try await save(merge(device: device, account: account.profile), account.version)
            if make(device: device, account: saved.profile) == nil { return saved.profile }
            account = saved
        }
        return nil
    }
}
