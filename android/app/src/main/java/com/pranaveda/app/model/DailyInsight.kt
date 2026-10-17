package com.pranaveda.app.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.pranaveda.app.net.ApiClient
import com.pranaveda.app.ui.chat.ChatViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import java.time.LocalDateTime

/**
 * Amrita's short daily reflection, as on the website's home page
 * (src/components/WellnessInsight.tsx, served by POST /api/insight).
 */
@Serializable
data class DailyInsight(
    val headline: String,
    val quote: String,
    /** A practice name, e.g. "Sama Vritti". */
    val focus: String,
    val tip: String,
    /** The server's stand-in when Claude could not be reached. */
    @SerialName("_isFallback") val isFallback: Boolean = false,
)

/**
 * One reflection per launch, like the website's one per visit: fresh each
 * time the app starts, steady while it runs. A stand-in reply is shown but
 * not kept, so the next visit to the screen asks again.
 */
class DailyInsightStore(
    private val fetch: suspend (profile: JsonObject, localTime: String) -> DailyInsight =
        ApiClient()::dailyInsight,
) {
    sealed interface State {
        data object Loading : State
        data class Loaded(val insight: DailyInsight) : State

        /** Offline or the server failed: the screen shows the website's offline words instead. */
        data object Unavailable : State
    }

    var state by mutableStateOf<State>(State.Loading)
        private set
    private var inFlight = false

    /** The wellness profile makes the reflection personal (the server never mentions it outright). */
    suspend fun loadIfNeeded(profile: JsonObject, now: LocalDateTime = LocalDateTime.now()) {
        (state as? State.Loaded)?.let { if (!it.insight.isFallback) return }
        if (inFlight) return
        inFlight = true
        if (state == State.Unavailable) state = State.Loading
        try {
            state = State.Loaded(fetch(profile, now.format(ChatViewModel.LOCAL_TIME)))
        } catch (e: CancellationException) {
            // Left the screen first: still Loading, so asked again next time it appears.
            throw e
        } catch (e: Exception) {
            state = State.Unavailable
        } finally {
            inFlight = false
        }
    }
}
