import Foundation
import Testing
@testable import PranaVeda

struct ChatDecodingTests {
    @Test func decodesTextProfileErrorAndDoneEvents() {
        guard case .text(let delta)? = APIClient.decodeEvent(#"{"type":"text","delta":"Breathe"}"#) else { Issue.record("text"); return }
        #expect(delta == "Breathe")
        guard case .profile(let profile)? = APIClient.decodeEvent(#"{"type":"profile","profile":{"name":"Meera","goals":["rest"],"futureField":{"a":1}}}"#) else { Issue.record("profile"); return }
        #expect(profile["name"]?.stringValue == "Meera")
        #expect(profile["futureField"] != nil) // unknown fields survive
        guard case .error(let message)? = APIClient.decodeEvent(#"{"type":"error","message":"Rate limited"}"#) else { Issue.record("error"); return }
        #expect(message == "Rate limited")
        guard case .done? = APIClient.decodeEvent(#"{"type":"done"}"#) else { Issue.record("done"); return }
        #expect(APIClient.decodeEvent("not json") == nil)
    }

    @Test func decodesARitualCardAsTheServerSendsIt() throws {
        let json = #"""
        {"type":"card","card":{"kind":"ritual","result":{
          "summary":"For a restless evening","doshaTendency":"Vata","primaryEnergy":"Scattered Wind",
          "yogaPractice":{"title":"Evening wind-down","description":"Slow","durationMinutes":12,"poses":[
            {"poseId":"triangle","nameEnglish":"Triangle Pose","nameSanskrit":"Trikonasana","duration":"2 minutes",
             "benefits":"Opens","instructions":"Reach.","poseImageUrl":"/poses/triangle.jpg",
             "sceneImageUrl":"/poses_with_background/web/triangle_wide.webp"},
            {"poseId":"tadasana","nameEnglish":"Equal Standing Pose","nameSanskrit":"Tadasana","duration":"1 minute",
             "benefits":"Grounds","instructions":"Stand.","poseImageUrl":"https://images.unsplash.com/photo-1"}]},
          "ayurvedicAdvice":{"assessment":"x","doshaPrimary":"Vata","dietaryTips":[],"lifestyleTips":[],"recommendedHerbs":[]},
          "breathwork":{"name":"Equal Breathing","sanskritName":"Sama Vritti","description":"Even","inhale":4,"holdActive":4,"exhale":4,"holdEmpty":4,"cycles":6,"benefits":"Calm"},
          "lifestyleTips":[]}}}
        """#
        guard case .card(.ritual(let result))? = APIClient.decodeEvent(json) else { Issue.record("ritual"); return }
        #expect(result.yogaPractice.title == "Evening wind-down")
        #expect(result.yogaPractice.poses.count == 2)
        #expect(result.breathwork?.rhythm == "In 4 · hold 4 · out 4 · rest 4")

        let base = URL(string: "http://localhost:3000")!
        let triangle = result.yogaPractice.poses[0]
        #expect(AppConfig.resolve(triangle.sceneImageUrl ?? triangle.poseImageUrl, base: base)?.absoluteString
                == "http://localhost:3000/poses_with_background/web/triangle_wide.webp")
        let tadasana = result.yogaPractice.poses[1]
        #expect(AppConfig.resolve(tadasana.sceneImageUrl ?? tadasana.poseImageUrl, base: base)?.absoluteString
                == "https://images.unsplash.com/photo-1")
    }

    @Test func decodesOptionsBreathworkAndDoshaCards() {
        guard case .card(.options(let options))? = APIClient.decodeEvent(#"{"type":"card","card":{"kind":"options","options":[{"label":"Calm","emoji":"🌙"},{"label":"Energise"}]}}"#)
        else { Issue.record("options"); return }
        #expect(options.map(\.label) == ["Calm", "Energise"])

        guard case .card(.breathwork(let note, let pattern))? = APIClient.decodeEvent(#"{"type":"card","card":{"kind":"breathwork","note":"Before bed","pattern":{"name":"Ocean Breath","inhale":4,"holdActive":0,"exhale":6,"holdEmpty":0,"cycles":8}}}"#)
        else { Issue.record("breathwork"); return }
        #expect(note == "Before bed")
        #expect(pattern.rhythm == "In 4 · out 6")

        guard case .card(.doshaProfile(let dosha))? = APIClient.decodeEvent(#"{"type":"card","card":{"kind":"dosha_profile","primary":"Vata","secondary":"Pitta","balance":{"vata":50,"pitta":30,"kapha":20},"essence":"Airy","explanation":"…","guidance":[],"confidence":"medium"}}"#)
        else { Issue.record("dosha"); return }
        #expect(dosha.primary == "Vata")
        #expect(dosha.balance.kapha == 20)
    }

    @Test func showsNothingForACardKindItDoesNotKnow() {
        guard case .card(.unsupported(let kind))? = APIClient.decodeEvent(#"{"type":"card","card":{"kind":"video_session","url":"x"}}"#)
        else { Issue.record("unsupported"); return }
        #expect(kind == "video_session")
    }

    @Test func describesCardOnlyTurnsToAmritaTheWayTheWebAppDoes() {
        let pattern = BreathworkPattern(name: "Ocean Breath", sanskritName: nil, description: nil, inhale: 4, holdActive: 0, exhale: 6, holdEmpty: 0, cycles: 8, benefits: nil)
        let item = ChatItem(role: .assistant, cards: [.breathwork(note: nil, pattern: pattern)])
        #expect(item.modelContent == "[Presented: Ocean Breath]")
        #expect(ChatItem(role: .assistant, text: "Hello").modelContent == "Hello")
    }

    @Test func resolvesOnlySitePathsAgainstTheAPI() {
        let base = URL(string: "https://pranaveda.example")!
        #expect(AppConfig.resolve("/poses/cobra.jpg", base: base)?.absoluteString == "https://pranaveda.example/poses/cobra.jpg")
        #expect(AppConfig.resolve("https://cdn.example/a.webp", base: base)?.absoluteString == "https://cdn.example/a.webp")
        #expect(AppConfig.resolve(nil, base: base) == nil)
        #expect(AppConfig.resolve("", base: base) == nil)
    }
}
