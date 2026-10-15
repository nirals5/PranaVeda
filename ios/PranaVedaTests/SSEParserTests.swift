import Testing
@testable import PranaVeda

struct SSEParserTests {
    private func bytes(_ s: String) -> [UInt8] { Array(s.utf8) }

    @Test func readsEventsSeparatedByBlankLines() {
        var parser = SSEParser()
        let events = parser.feed(bytes("data: {\"type\":\"text\",\"delta\":\"Hi\"}\n\ndata: {\"type\":\"done\"}\n\n"))
        #expect(events == ["{\"type\":\"text\",\"delta\":\"Hi\"}", "{\"type\":\"done\"}"])
    }

    @Test func keepsAnEventSplitAcrossChunks() {
        var parser = SSEParser()
        #expect(parser.feed(bytes("data: {\"type\":\"te")).isEmpty)
        #expect(parser.feed(bytes("xt\",\"delta\":\"Hello\"}\n")).isEmpty)
        #expect(parser.feed(bytes("\n")) == ["{\"type\":\"text\",\"delta\":\"Hello\"}"])
    }

    @Test func handlesCarriageReturnsCommentsAndOtherFields() {
        var parser = SSEParser()
        let events = parser.feed(bytes(": keep-alive\r\nevent: message\r\ndata: one\r\n\r\n"))
        #expect(events == ["one"])
    }

    @Test func joinsMultipleDataLinesOfOneEvent() {
        var parser = SSEParser()
        #expect(parser.feed(bytes("data: line one\ndata: line two\n\n")) == ["line one\nline two"])
    }

    @Test func returnsAnEventLeftWithoutItsBlankLineWhenTheStreamEnds() {
        var parser = SSEParser()
        #expect(parser.feed(bytes("data: last")).isEmpty)
        #expect(parser.finish() == "last")
        #expect(parser.finish() == nil)
    }

    @Test func keepsMultibyteCharactersIntactAcrossChunks() {
        var parser = SSEParser()
        let all = bytes("data: Prāṇa 🌙\n\n")
        var events: [String] = []
        for byte in all { events += parser.feed([byte]) }
        #expect(events == ["Prāṇa 🌙"])
    }
}
