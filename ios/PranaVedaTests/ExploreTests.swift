import Foundation
import Testing
@testable import PranaVeda

/// Library → Explore (G3): the advanced poses Amrita never offers.
struct ExploreTests {
    let json = """
    {"poses": [], "breathwork": [], "explore": [{
      "id": "P33", "nameSanskrit": "Sirsasana", "nameEnglish": "Headstand",
      "bodyFocus": "Full-Body / Inversion / Core", "benefits": "A full inversion that builds focus.",
      "cues": ["Learn it with a teacher"], "commonMistakes": ["Kicking up"], "modifications": "Dolphin Pose first.",
      "avoidWith": [
        {"code": "neck_injury", "label": "Neck injury", "words": ["stiff neck", "whiplash"]},
        {"code": "hypertension", "label": "High blood pressure", "words": ["high bp"]}
      ],
      "followWith": "Child's Pose", "avoidAfterMeal": true
    }]}
    """

    @Test func decodesTheExploreList() throws {
        let catalog = try JSONDecoder().decode(Catalog.self, from: Data(json.utf8))
        let headstand = try #require(catalog.explore?.first)
        #expect(headstand.nameEnglish == "Headstand")
        #expect(headstand.followWith == "Child's Pose")
        #expect(headstand.avoidAfterMeal == true)
        #expect(headstand.sourceCaution == nil)
    }

    @Test func olderServersHaveNoExplore() throws {
        let catalog = try JSONDecoder().decode(Catalog.self, from: Data(#"{"poses": [], "breathwork": []}"#.utf8))
        #expect(catalog.explore == nil)
    }

    @Test func saysWhenItIsNotForThem() throws {
        let headstand = try #require(try JSONDecoder().decode(Catalog.self, from: Data(json.utf8)).explore?.first)
        #expect(headstand.notFor(["Whiplash last year"]) == ["Neck injury"])
        #expect(headstand.notFor(["high BP", "neck injury"]) == ["Neck injury", "High blood pressure"])
        #expect(headstand.notFor(["hypertension"]) == ["High blood pressure"])
        #expect(headstand.notFor(["sore knee"]).isEmpty)
        // A whole word only: "neck" in "necklace" is not a neck injury.
        #expect(headstand.notFor(["allergic to my necklace"]).isEmpty)
        #expect(headstand.notFor([]).isEmpty)
    }
}
