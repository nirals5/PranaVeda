import Foundation
import Testing
@testable import PranaVeda

struct DoshaProfileTests {
    private func profile(_ json: String) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
    }

    @Test func readsTheAssessmentAmritaSavedToTheProfile() throws {
        let value = try profile(#"""
        {"name":"Meera","prakriti":"Vata-Pitta","doshaProfile":{
          "primary":"Vata","secondary":"Pitta","balance":{"vata":55,"pitta":30,"kapha":15},
          "essence":"Quick as the wind","explanation":"Airy and bright.","guidance":["Keep warm"],
          "confidence":"medium","assessedDate":"2026-10-12"}}
        """#)
        let dosha = try #require(SavedDoshaProfile(profile: value))
        #expect(dosha.primary == "Vata")
        #expect(dosha.secondary == "Pitta")
        #expect(dosha.balance.kapha == 15)
        #expect(dosha.guidance == ["Keep warm"])
        #expect(dosha.assessedDate == "2026-10-12")
    }

    @Test func invitesTheDiscoveryWithoutACompleteAssessment() throws {
        #expect(SavedDoshaProfile(profile: try profile(#"{"prakriti":"Kapha"}"#)) == nil)
        #expect(SavedDoshaProfile(profile: try profile(#"{"doshaProfile":{"primary":"Kapha"}}"#)) == nil)
        #expect(SavedDoshaProfile(profile: .object([:])) == nil)
    }

    @Test func decodesTheGuideAsTheServerSendsIt() throws {
        let json = #"""
        {"doshas":{"Vata":{"tagline":"Air & Space","qualities":"Light","aggravatedBy":"Wind","balancedBy":"Warmth",
          "diet":["Soups"],"lifestyle":["Routine"],"breath":"Nadi Shodhana","practiceStyle":"Slow","rhythm":"Early","season":"Autumn"}},
         "note":"Not a medical diagnosis."}
        """#
        let guide = try JSONDecoder().decode(DoshaGuide.self, from: Data(json.utf8))
        #expect(guide.doshas["Vata"]?.diet == ["Soups"])
        #expect(guide.note == "Not a medical diagnosis.")
    }

    @Test func describesConfidenceAndDateAsTheWebsiteDoes() {
        #expect(DoshaProfileView.confidenceLine(confidence: "medium", assessedDate: "2026-10-12") == "medium confidence · 2026-10-12")
        #expect(DoshaProfileView.confidenceLine(confidence: "high", assessedDate: nil) == "high confidence")
        #expect(DoshaProfileView.confidenceLine(confidence: nil, assessedDate: nil) == nil)
    }
}
