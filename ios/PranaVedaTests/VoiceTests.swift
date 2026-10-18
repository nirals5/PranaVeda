import Testing
@testable import PranaVeda

struct VoiceTests {
    @Test func readsTheReplyWithoutItsMarkup() {
        #expect(AmritaVoice.speakable("Let us **slow** the _breath_.") == "Let us slow the breath.")
        #expect(AmritaVoice.speakable("- Warm water\n- Early sleep") == "Warm water Early sleep")
        #expect(AmritaVoice.speakable("See [the guide](https://example.com) # now") == "See the guide now")
        #expect(AmritaVoice.speakable(#"Rest. <break time="1s" /> Breathe."#) == "Rest. Breathe.")
        #expect(AmritaVoice.speakable("```\ncode\n```") == "")
    }
}
