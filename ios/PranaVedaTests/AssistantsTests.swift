import Foundation
import Testing
@testable import PranaVeda

struct AssistantsTests {
    @Test func siriPhrasesNameASavedRitualWhenThereIsOne() {
        #expect(Assistants.siriPhrases(ritual: "Evening Wind-Down") == [
            "Talk to Amrita",
            "Start Evening Wind-Down in PranaVeda",
            "How's my PranaVeda streak",
        ])
        #expect(Assistants.siriPhrases(ritual: nil) == [
            "Talk to Amrita",
            "Start my practice in PranaVeda",
            "How's my PranaVeda streak",
        ])
    }

    @Test func alexaIsListedOnlyWhenTheServerSaysSo() throws {
        let none = try JSONDecoder().decode(Assistants.self, from: Data(#"{"alexa":null}"#.utf8))
        #expect(none.alexa == nil)
        let live = try JSONDecoder().decode(Assistants.self, from: Data(#"{"alexa":{"url":"https://www.amazon.com/dp/B0EXAMPLE1","phrases":["Alexa, open Prana Veda"]}}"#.utf8))
        #expect(live.alexa?.url.absoluteString == "https://www.amazon.com/dp/B0EXAMPLE1")
        #expect(live.alexa?.phrases == ["Alexa, open Prana Veda"])
    }
}
