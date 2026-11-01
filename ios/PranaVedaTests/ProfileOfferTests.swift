import Foundation
import Testing
@testable import PranaVeda

/// What a phone knew before sign-in that the account doesn't, and adding it on
/// a yes. The same cases as the website (tests/profileOffer.test.ts).
@MainActor struct ProfileOfferTests {
    private func profile(_ json: String) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
    }

    @Test func listsWhatTheAccountLacksConditionsFirst() throws {
        let offer = try #require(ProfileOffer.make(
            device: profile(#"{"goals":["Sleep better"],"conditions":["Bad knee","High BP"],"preferences":["Mornings"]}"#),
            account: profile(#"{"conditions":["High BP"]}"#)
        ))
        #expect(offer.items == ["Bad knee", "Goal: Sleep better", "Preference: Mornings"])
        #expect(offer.health == 1)
    }

    @Test func capitalsAndSpacingAreTheSameDetail() throws {
        #expect(try ProfileOffer.make(device: profile(#"{"conditions":["  bad   KNEE "]}"#), account: profile(#"{"conditions":["Bad knee"]}"#)) == nil)
    }

    @Test func singleDetailsOnlyWhenTheAccountHasNone() throws {
        let offer = try #require(ProfileOffer.make(
            device: profile(#"{"name":"Device","prakriti":"Vata","experience":"experienced"}"#),
            account: profile(#"{"name":"Account","prakriti":""}"#)
        ))
        #expect(offer.items == ["Constitution: Vata", "Experience: Experienced"])
    }

    @Test func amritasOwnNotesAloneDontAsk() throws {
        let device = try profile(#"{"observations":[{"date":"2026-10-31","note":"Slept well"}],"practiceHistory":[{"date":"2026-10-31","title":"Box","kind":"breathwork"}]}"#)
        #expect(try ProfileOffer.make(device: device, account: profile("{}")) == nil)
    }

    @Test func nothingWithoutADeviceCopyOrWhenNothingIsMissing() throws {
        #expect(try ProfileOffer.make(device: nil, account: profile(#"{"conditions":["Bad knee"]}"#)) == nil)
        #expect(try ProfileOffer.make(device: profile(#"{"conditions":["Bad knee"]}"#), account: profile(#"{"conditions":["Bad knee"],"goals":["More"]}"#)) == nil)
    }

    @Test func theKeyIgnoresOrder() throws {
        let a = try #require(try ProfileOffer.make(device: profile(#"{"conditions":["One","Two"]}"#), account: profile("{}")))
        let b = try #require(try ProfileOffer.make(device: profile(#"{"conditions":["two","one"]}"#), account: profile("{}")))
        #expect(a.key == b.key)
    }

    @Test func summaryNamesHealthDetailsOnlyWhenThereAreSome() throws {
        func summary(_ json: String) throws -> String {
            try #require(try ProfileOffer.make(device: profile(json), account: profile("{}"))).summary
        }
        #expect(try summary(#"{"conditions":["One"]}"#) == "This device has 1 health detail your account doesn't have.")
        #expect(try summary(#"{"conditions":["One","Two"]}"#) == "This device has 2 health details your account doesn't have.")
        #expect(try summary(#"{"goals":["One"]}"#) == "This device has 1 detail your account doesn't have.")
        #expect(try summary(#"{"conditions":["One"],"goals":["Two"]}"#) == "This device has 2 details, including health details, your account doesn't have.")
    }

    @Test func mergeAddsWhatsMissingAndChangesNothingTheAccountHas() throws {
        let merged = try ProfileOffer.merge(
            device: profile(#"{"name":"Device","conditions":["high bp","Bad knee"],"goals":["Sleep"],"prakriti":"Vata","prakritiConfidence":"low","experience":"regular"}"#),
            account: profile(#"{"name":"Account","conditions":["High BP"],"prakriti":"Pitta","prakritiConfidence":"high","custom":"kept"}"#)
        )
        #expect(try merged == profile(#"{"name":"Account","conditions":["High BP","Bad knee"],"goals":["Sleep"],"prakriti":"Pitta","prakritiConfidence":"high","experience":"regular","custom":"kept"}"#))
    }

    @Test func mergeBringsAmritasNotesWithoutRepeats() throws {
        let shared = #"{"date":"2026-10-30","title":"Box","kind":"breathwork"}"#
        let added = #"{"date":"2026-10-31","title":"Morning","kind":"ritual"}"#
        let merged = try ProfileOffer.merge(device: profile(#"{"practiceHistory":[\#(shared),\#(added)]}"#), account: profile(#"{"practiceHistory":[\#(shared)]}"#))
        #expect(try merged["practiceHistory"] == profile("[\(shared),\(added)]"))
    }

    @Test func mergeStaysWithinTheServersLimit() throws {
        let many = (0..<60).map { JSONValue.string("Account \($0)") }
        let merged = try ProfileOffer.merge(device: profile(#"{"conditions":["Extra"]}"#), account: .object(["conditions": .array(many)]))
        #expect(merged["conditions"] == .array(many))
    }

    @Test func nothingLeftToOfferAfterMerging() throws {
        let device = try profile(#"{"conditions":["One"],"goals":["Two"],"name":"N","vikriti":"Vata","experience":"regular"}"#)
        #expect(try ProfileOffer.make(device: device, account: ProfileOffer.merge(device: device, account: profile(#"{"name":"Other"}"#))) == nil)
    }

    @Test func addSavesOnTheVersionItRead() async throws {
        var versions: [Int] = []
        let device = try profile(#"{"conditions":["Bad knee"]}"#)
        let start = try profile(#"{"goals":["Sleep"]}"#)
        let stored = try await ProfileOffer.add(device: device, load: { VersionedProfile(profile: start, version: 3) }, save: { merged, version in
            versions.append(version)
            return VersionedProfile(profile: merged, version: version + 1)
        })
        #expect(versions == [3])
        #expect(try stored == profile(#"{"goals":["Sleep"],"conditions":["Bad knee"]}"#))
    }

    @Test func addRetriesOnceKeepingTheOtherDevicesChange() async throws {
        var versions: [Int] = []
        let device = try profile(#"{"conditions":["Bad knee"]}"#)
        let empty = try profile("{}")
        let theirs = try profile(#"{"goals":["Theirs"]}"#)
        let stored = try await ProfileOffer.add(device: device, load: { VersionedProfile(profile: empty, version: 3) }, save: { merged, version in
            versions.append(version)
            return version == 3 ? VersionedProfile(profile: theirs, version: 4) : VersionedProfile(profile: merged, version: version + 1)
        })
        #expect(versions == [3, 4])
        #expect(try stored == profile(#"{"goals":["Theirs"],"conditions":["Bad knee"]}"#))
    }

    @Test func addGivesUpAfterASecondConflict() async throws {
        var saves = 0
        let device = try profile(#"{"conditions":["Bad knee"]}"#)
        let empty = try profile("{}")
        let stored = try await ProfileOffer.add(device: device, load: { VersionedProfile(profile: empty, version: 1) }, save: { _, _ in
            saves += 1
            return VersionedProfile(profile: empty, version: 1 + saves)
        })
        #expect(stored == nil)
        #expect(saves == 2)
    }
}
