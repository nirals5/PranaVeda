package com.pranaveda.app.model

import com.pranaveda.app.auth.VersionedProfile
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/**
 * What this phone knew before sign-in that the account doesn't. Signed in, the
 * account is the profile, so without this a condition entered only here would
 * quietly stop reaching Amrita. Nothing moves until the person says yes: the
 * details could be someone else's, and they can be about health. Same rules as
 * the website (src/lib/profileOffer.ts).
 */
data class ProfileOffer(
    /** What to show, in order: conditions first. */
    val items: List<String>,
    /** How many of them are health conditions. */
    val health: Int,
    /** Identifies this offer, so "Not now" holds until the phone's copy changes. */
    val key: String,
) {
    /** "1 health detail", or "3 details, including health details", and so on. */
    val summary: String
        get() {
            val count = items.size
            val what = if (health == count) {
                "$count health ${if (count == 1) "detail" else "details"}"
            } else {
                "$count ${if (count == 1) "detail" else "details"}${if (health > 0) ", including health details," else ""}"
            }
            return "This device has $what your account doesn't have."
        }

    companion object {
        /** The server's limit on each list (api/_lib/profileSchema.ts). */
        private const val MAX_ITEMS = 60

        private val SPACES = Regex("\\s+")

        private fun same(text: String) = text.trim().replace(SPACES, " ").lowercase()

        private fun text(value: JsonElement?) = (value as? JsonPrimitive)?.takeUnless { it is JsonNull }?.contentOrNull

        private fun blank(value: JsonElement?) = value == null || value is JsonNull || text(value) == ""

        private fun entries(value: JsonElement?) = (value as? JsonArray).orEmpty()

        private fun strings(value: JsonElement?) = entries(value).mapNotNull(::text)

        private fun missing(account: List<String>, device: List<String>): List<String> {
            val seen = account.map(::same).toMutableSet()
            return device.filter { same(it).isNotEmpty() && seen.add(same(it)) }.map { it.trim() }
        }

        /**
         * The offer, or null when the account already has everything worth
         * asking about. Observations and practice history are Amrita's notes
         * rather than something the person entered, so alone they don't prompt
         * a question.
         */
        fun of(device: JsonObject?, account: JsonObject): ProfileOffer? {
            if (device == null) return null
            val conditions = missing(strings(account["conditions"]), strings(device["conditions"]))
            val items = conditions.toMutableList()
            items += missing(strings(account["goals"]), strings(device["goals"])).map { "Goal: $it" }
            items += missing(strings(account["preferences"]), strings(device["preferences"])).map { "Preference: $it" }
            fun single(field: String, label: String, shown: (JsonElement) -> String?) {
                val value = device[field]
                if (blank(account[field]) && !blank(value)) shown(value!!)?.let { items += "$label: $it" }
            }
            single("name", "Name", ::text)
            single("prakriti", "Constitution", ::text)
            single("vikriti", "Current imbalance", ::text)
            single("doshaProfile", "Dosha result") { text(it.jsonObject["primary"]) }
            single("experience", "Experience") { value -> text(value)?.replaceFirstChar { it.uppercase() } }
            if (items.isEmpty()) return null
            return ProfileOffer(items, conditions.size, items.map(::same).sorted().joinToString("\n"))
        }

        /** The account's profile with this phone's details added. Nothing the account already has is changed or removed. */
        fun merge(device: JsonObject, account: JsonObject): JsonObject {
            val merged = account.toMutableMap()
            for (list in listOf("conditions", "goals", "preferences")) {
                val added = missing(strings(account[list]), strings(device[list]))
                if (added.isNotEmpty()) merged[list] = JsonArray((entries(account[list]) + added.map(::JsonPrimitive)).take(MAX_ITEMS))
            }
            for (field in listOf("name", "vikriti", "doshaProfile", "experience")) {
                if (blank(account[field]) && !blank(device[field])) merged[field] = device.getValue(field)
            }
            if (blank(account["prakriti"]) && !blank(device["prakriti"])) {
                merged["prakriti"] = device.getValue("prakriti")
                if (!blank(device["prakritiConfidence"])) merged["prakritiConfidence"] = device.getValue("prakritiConfidence")
            }
            for (list in listOf("observations", "practiceHistory")) {
                val current = entries(account[list]).toMutableList()
                for (entry in entries(device[list])) {
                    if (current.size < MAX_ITEMS && entry !in current) current += entry
                }
                if (current.isNotEmpty()) merged[list] = JsonArray(current)
            }
            return JsonObject(merged)
        }

        /**
         * Adds the details starting from the account's latest copy. If another
         * device saved first, the save returns theirs with the details still
         * missing, so it tries once more on that. The stored profile on success.
         */
        suspend fun add(
            device: JsonObject,
            load: suspend () -> VersionedProfile,
            save: suspend (JsonObject, Int) -> VersionedProfile,
        ): JsonObject? {
            var account = load()
            repeat(2) {
                val saved = save(merge(device, account.profile), account.version)
                if (of(device, saved.profile) == null) return saved.profile
                account = saved
            }
            return null
        }
    }
}
