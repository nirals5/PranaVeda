import SiriEvaluations
import Testing

// Scripted requests to the new Siri (KAN-21): which PranaVeda tool Siri calls,
// how it fills it, and whether it loads the wind-down skill. They drive real
// Siri on a real iPhone on iOS 27.3 or later, with PranaVeda installed and
// opened once; see ios/README.md. Not part of CI.

struct PranaVedaEvaluation: Evaluation {
    let name: String
    let dataset: SiriScenarioLoader

    func subject(from sample: SiriScenario) async throws -> SiriScenarioSubject {
        try await SiriService.run(scenario: sample)
    }

    var evaluators: Evaluators {
        SiriExpectationEvaluator()
    }

    func aggregateMetrics(using aggregator: inout MetricsAggregator) {
        Self.computeSiriMetrics(into: &aggregator)
    }
}

@Suite("PranaVeda - Siri", .serialized)
struct PranaVedaSiriEvaluationTests {
    static let app = IntentDefinitions(bundleIdentifier: "com.pranaveda.app")
    static let StartPracticeIntent = app.intents["StartPracticeIntent"]
    static let AskAmritaIntent = app.intents["AskAmritaIntent"]
    static let PracticeSummaryIntent = app.intents["PracticeSummaryIntent"]
    static let ShowPoseIntent = app.intents["ShowPoseIntent"]
    static let PlayFlowIntent = app.intents["PlayFlowIntent"]
    static let LibraryPoseEntity = app.entities["LibraryPoseEntity"]
    static let FlowEntity = app.entities["FlowEntity"]
    static let SavedRitualEntity = app.entities["SavedRitualEntity"]
    static let WindDownSkill = app.skills["wind-down-for-bed"]

    // MARK: Practice summary

    static let streak = SiriScenario {
        UserTurn("How's my practice streak in PranaVeda?") {
            Calls { PracticeSummaryIntent }
            Calls(.disallowed) { StartPracticeIntent }
        }
    }

    static let thisWeek = SiriScenario {
        UserTurn("In PranaVeda, how much have I practised this week?") {
            Calls { PracticeSummaryIntent }
        }
    }

    static let summaryEvaluation = PranaVedaEvaluation(
        name: "PranaVeda - Practice summary",
        dataset: SiriScenarioLoader { streak; thisWeek }
    )

    @Test("Siri answers with the practice summary", .evaluates(summaryEvaluation))
    func practiceSummary() {
        #expect(EvaluationContext.current.result.aggregateValue(.mean(of: .intentsAllPass)) == 1.0)
    }

    // MARK: Ask Amrita

    static let askDinner = SiriScenario {
        UserTurn("In PranaVeda, ask Amrita what I should eat for dinner") {
            Calls { AskAmritaIntent.expect(question: .contains("dinner")) }
            Calls(.disallowed) { StartPracticeIntent }
        }
    }

    static let askEvaluation = PranaVedaEvaluation(
        name: "PranaVeda - Ask Amrita",
        dataset: SiriScenarioLoader { askDinner }
    )

    @Test("Siri passes the question to Amrita", .evaluates(askEvaluation))
    func askAmrita() {
        #expect(EvaluationContext.current.result.aggregateValue(.mean(of: .intentsAllPass)) == 1.0)
    }

    // MARK: Library

    static let showChildsPose = SiriScenario {
        UserTurn("Show me Child's Pose in PranaVeda") {
            Calls { ShowPoseIntent.expect(pose: LibraryPoseEntity.expectIdentifier("childs_pose")) }
            Calls(.disallowed) { StartPracticeIntent }
        }
    }

    static let playWarriorFlow = SiriScenario {
        UserTurn("Play Warrior Flow in PranaVeda") {
            Calls { PlayFlowIntent.expect(flow: FlowEntity.expectIdentifier("warrior_flow")) }
        }
    }

    // Four flows are yin, so Siri asks which one; the answer plays it.
    static let playAYinFlow = SiriScenario {
        UserTurn("Play a yin video in PranaVeda") {
            SiriResponse(.contains("which", caseSensitive: false))
        }
        UserTurn("Yin Dragon with Puppy") {
            Calls { PlayFlowIntent.expect(flow: FlowEntity.expectIdentifier("yin_dragon_flow_with_puppy_pose")) }
        }
    }

    static let libraryEvaluation = PranaVedaEvaluation(
        name: "PranaVeda - Library poses and flows",
        dataset: SiriScenarioLoader { showChildsPose; playWarriorFlow; playAYinFlow }
    )

    @Test("Siri shows the named pose and plays the named flow", .evaluates(libraryEvaluation))
    func library() {
        #expect(EvaluationContext.current.result.aggregateValue(.mean(of: .intentsAllPass)) == 1.0)
    }

    // MARK: Saved rituals
    // Needs at least one saved ritual on the iPhone; which one Siri picks
    // depends on what is saved, so only the intent is checked.

    static let startMyPractice = SiriScenario {
        UserTurn("Start my practice in PranaVeda") {
            Calls { StartPracticeIntent }
            Calls(.disallowed) { PlayFlowIntent }
        }
    }

    static let practiceEvaluation = PranaVedaEvaluation(
        name: "PranaVeda - Start my practice",
        dataset: SiriScenarioLoader { startMyPractice }
    )

    @Test("Siri starts a saved ritual", .evaluates(practiceEvaluation))
    func startPractice() {
        #expect(EvaluationContext.current.result.aggregateValue(.mean(of: .intentsAllPass)) == 1.0)
    }

    // MARK: App skill

    static let windDown = SiriScenario {
        UserTurn("Help me wind down for bed with PranaVeda") {
            Loads(.required) { WindDownSkill }
            Calls(.disallowed) { PracticeSummaryIntent }
        }
    }

    static let relaxBeforeSleep = SiriScenario {
        UserTurn("In PranaVeda, I want to relax before sleep") {
            Loads(.required) { WindDownSkill }
        }
    }

    static let skillsEvaluation = PranaVedaEvaluation(
        name: "PranaVeda - App Skills",
        dataset: SiriScenarioLoader { windDown; relaxBeforeSleep }
    )

    @Test("Siri loads the wind-down skill", .evaluates(skillsEvaluation))
    func loadsSkills() {
        #expect(EvaluationContext.current.result.aggregateValue(.mean(of: .skillsLoadedAllPass)) == 1.0)
    }
}
