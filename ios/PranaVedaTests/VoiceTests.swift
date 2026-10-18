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

    @Test func turnsLoudnessIntoWaveHeights() {
        #expect(VoiceListener.normalizedLevel(rms: 0) == 0)
        #expect(VoiceListener.normalizedLevel(rms: 0.001) == 0) // -60 dB: a quiet room
        #expect(abs(VoiceListener.normalizedLevel(rms: 0.01) - 0.25) < 0.001) // -40 dB
        #expect(VoiceListener.normalizedLevel(rms: 0.5) == 1) // loud: capped
    }
}
