package com.pranaveda.app.model

import com.pranaveda.app.config.AppConfig
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID

// Shapes of the cards Amrita sends in the chat stream (see ChatCard in the
// web app's src/types.ts). Most fields are written by the model, so decoding
// is lenient: unknown fields are ignored and a missing optional field must not
// lose the whole card.

/** The JSON settings for everything the API sends and receives. */
val PvJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

@Serializable
data class BreathworkPattern(
    val name: String,
    val sanskritName: String? = null,
    val description: String? = null,
    val inhale: Double,
    val holdActive: Double = 0.0,
    val exhale: Double,
    val holdEmpty: Double = 0.0,
    val cycles: Int,
    val benefits: String? = null,
    /** How to adapt it for one of the user's conditions (G13); the server adds it only when it applies. */
    val caution: String? = null,
) {
    /** "In 4 · hold 4 · out 4 · rest 4" */
    val rhythm: String
        get() {
            fun s(v: Double) = if (v == Math.rint(v)) v.toLong().toString() else v.toString()
            val parts = mutableListOf("In ${s(inhale)}")
            if (holdActive > 0) parts += "hold ${s(holdActive)}"
            parts += "out ${s(exhale)}"
            if (holdEmpty > 0) parts += "rest ${s(holdEmpty)}"
            return parts.joinToString(" · ")
        }
}

@Serializable
data class YogaPose(
    val poseId: String? = null,
    val nameEnglish: String,
    val nameSanskrit: String? = null,
    val duration: String? = null,
    val benefits: String? = null,
    val instructions: String? = null,
    val poseImageUrl: String? = null,
    val sceneImageUrl: String? = null,
    val videoUrl: String? = null,
    /** How to adapt it for one of the user's conditions (G13); the server adds it only when it applies. */
    val caution: String? = null,
) {
    /** Niral's room scene when the pose has one, else the flat photo. */
    val imageUrl: String? get() = AppConfig.resolve(sceneImageUrl ?: poseImageUrl)
}

@Serializable
data class YogaPractice(
    val title: String,
    val description: String? = null,
    val poses: List<YogaPose> = emptyList(),
    val durationMinutes: Int? = null,
)

@Serializable
data class AyurvedicAdvice(
    val assessment: String? = null,
    val doshaPrimary: String? = null,
    val dietaryTips: List<String>? = null,
    val lifestyleTips: List<String>? = null,
    val recommendedHerbs: List<String>? = null,
)

@Serializable
data class RecommendationResult(
    val summary: String? = null,
    val doshaTendency: String? = null,
    val primaryEnergy: String? = null,
    val yogaPractice: YogaPractice,
    val ayurvedicAdvice: AyurvedicAdvice? = null,
    val breathwork: BreathworkPattern? = null,
    val lifestyleTips: List<String>? = null,
)

@Serializable
data class AnswerOption(
    val label: String,
    val emoji: String? = null,
    val description: String? = null,
)

@Serializable
data class DoshaBalance(val vata: Double, val pitta: Double, val kapha: Double)

@Serializable
data class DoshaProfileCard(
    val primary: String,
    val secondary: String? = null,
    val balance: DoshaBalance,
    val essence: String? = null,
    val explanation: String? = null,
    val guidance: List<String>? = null,
    val confidence: String? = null,
)

sealed interface ChatCard {
    data class Ritual(val result: RecommendationResult) : ChatCard
    data class Breathwork(val note: String?, val pattern: BreathworkPattern) : ChatCard
    data class DoshaProfile(val profile: DoshaProfileCard) : ChatCard
    data class Options(val options: List<AnswerOption>) : ChatCard

    /** A card kind this version of the app does not know. Shown as nothing. */
    data class Unsupported(val kind: String) : ChatCard

    /** How the card is described to Amrita in later turns (matches the web app). */
    val modelMarker: String
        get() = when (this) {
            is Ritual -> result.yogaPractice.title
            is Breathwork -> pattern.name
            is DoshaProfile -> "Prakriti profile (${profile.primary})"
            is Options -> "answer options: " + options.joinToString(" / ") { it.label }
            is Unsupported -> kind
        }

    companion object {
        /** Reads a card as the server sends it; throws if a known kind is malformed. */
        fun decode(card: JsonObject): ChatCard {
            val kind = card["kind"]?.jsonPrimitive?.content ?: error("card without a kind")
            return when (kind) {
                "ritual" -> Ritual(PvJson.decodeFromJsonElement(card.getValue("result")))
                "breathwork" -> Breathwork(
                    note = card["note"]?.let { PvJson.decodeFromJsonElement<String?>(it) },
                    pattern = PvJson.decodeFromJsonElement(card.getValue("pattern")),
                )
                "dosha_profile" -> DoshaProfile(PvJson.decodeFromJsonElement(card))
                "options" -> Options(PvJson.decodeFromJsonElement(card.getValue("options")))
                else -> Unsupported(kind)
            }
        }
    }
}

data class ChatItem(
    val role: Role,
    val text: String = "",
    val cards: List<ChatCard> = emptyList(),
    val streaming: Boolean = false,
    val failed: Boolean = false,
    val id: String = UUID.randomUUID().toString(),
) {
    enum class Role(val wire: String) { User("user"), Assistant("assistant") }

    /**
     * The text Amrita sees for this turn: card-only turns become a marker,
     * so she remembers what she presented.
     */
    val modelContent: String
        get() = when {
            text.isNotEmpty() -> text
            cards.isEmpty() -> ""
            else -> "[Presented: " + cards.joinToString(", ") { it.modelMarker } + "]"
        }
}

/** The poses and breath practice that carry a caution note (G13), in order, as name to note. */
val RecommendationResult.cautions: List<Pair<String, String>>
    get() = yogaPractice.poses.mapNotNull { p -> p.caution?.let { p.nameEnglish to it } } +
        listOfNotNull(breathwork?.let { b -> b.caution?.let { b.name to it } })
