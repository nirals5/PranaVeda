package com.pranaveda.app.health

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CancellationException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Heart and sleep readings from Health Connect, read on the phone for
 * Recovery & Trends. They stay on the phone unless the person lets Amrita see
 * them; then a short summary ([HealthSummary]) goes with each message.
 */
class HealthStore(context: Context) {
    sealed interface State {
        /** Health Connect is not on this phone, or needs updating first. */
        data class Unavailable(val needsUpdate: Boolean) : State
        data object NotConnected : State
        data object Loading : State
        data class Loaded(val days: List<HealthDay>) : State
        data object Failed : State
    }

    private val appContext = context.applicationContext
    var state by mutableStateOf<State>(State.NotConnected)
        private set

    private val prefs = appContext.getSharedPreferences("pranaveda", Context.MODE_PRIVATE)

    /** Whether Amrita may see a summary of the readings. Off until they turn it on. */
    var sharesWithAmrita by mutableStateOf(prefs.getBoolean(SHARE_KEY, false))
        private set

    fun shareWithAmrita(on: Boolean) {
        sharesWithAmrita = on
        prefs.edit().putBoolean(SHARE_KEY, on).apply()
    }

    /** What goes with a message: nothing unless they let Amrita see it. */
    fun summaryForAmrita(today: LocalDate = LocalDate.now()): HealthSummary? {
        val loaded = state as? State.Loaded ?: return null
        return if (sharesWithAmrita) HealthTrends.summary(loaded.days, today) else null
    }

    private val client: HealthConnectClient? by lazy {
        runCatching { HealthConnectClient.getOrCreate(appContext) }.getOrNull()
    }

    init {
        state = when (HealthConnectClient.getSdkStatus(appContext)) {
            HealthConnectClient.SDK_AVAILABLE -> State.NotConnected
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> State.Unavailable(needsUpdate = true)
            else -> State.Unavailable(needsUpdate = false)
        }
    }

    /** Reads, if Health Connect has allowed it; otherwise offers to connect. */
    suspend fun load(today: LocalDate = LocalDate.now()) {
        val client = client ?: return
        if (state is State.Unavailable) return
        val granted = runCatching { client.permissionController.getGrantedPermissions() }.getOrDefault(emptySet())
        if (granted.isEmpty()) {
            state = State.NotConnected
            return
        }
        if (state !is State.Loaded) state = State.Loading
        state = try {
            val zone = ZoneId.systemDefault()
            val from = today.minusDays(HealthTrends.DAYS_SHOWN.toLong() + 1).atStartOfDay(zone).toInstant()
            val to = Instant.now()
            val sleep = if (READ_SLEEP in granted) {
                read(client, SleepSessionRecord::class, from, to).flatMap(::asleep)
            } else emptyList()
            val resting = if (READ_RESTING in granted) {
                read(client, RestingHeartRateRecord::class, from, to).map { it.time to it.beatsPerMinute.toDouble() }
            } else emptyList()
            val hrv = if (READ_HRV in granted) {
                read(client, HeartRateVariabilityRmssdRecord::class, from, to).map { it.time to it.heartRateVariabilityMillis }
            } else emptyList()
            State.Loaded(
                HealthTrends.combine(
                    today,
                    HealthTrends.sleepMinutes(sleep, zone),
                    HealthTrends.dailyAverages(resting, zone),
                    HealthTrends.dailyAverages(hrv, zone),
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            State.Failed
        }
    }

    /** Every record of a type in the range, following pages. */
    private suspend fun <T : Record> read(client: HealthConnectClient, type: KClass<T>, from: Instant, to: Instant): List<T> {
        val records = mutableListOf<T>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(from, to), pageToken = pageToken))
            records += response.records
            pageToken = response.pageToken
        } while (pageToken != null)
        return records
    }

    companion object {
        private const val SHARE_KEY = "pranaveda_health_share_with_amrita"
        val READ_SLEEP = HealthPermission.getReadPermission(SleepSessionRecord::class)
        val READ_RESTING = HealthPermission.getReadPermission(RestingHeartRateRecord::class)
        val READ_HRV = HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
        /** What Recovery & Trends asks to read, and nothing else. */
        val PERMISSIONS = setOf(READ_SLEEP, READ_RESTING, READ_HRV)

        fun permissionContract() = PermissionController.createRequestPermissionResultContract()

        /** The time actually asleep in a session: its sleeping stages if it has any, else the whole session. */
        fun asleep(session: SleepSessionRecord): List<HealthTrends.Span> {
            val sleeping = setOf(
                SleepSessionRecord.STAGE_TYPE_SLEEPING, SleepSessionRecord.STAGE_TYPE_LIGHT,
                SleepSessionRecord.STAGE_TYPE_DEEP, SleepSessionRecord.STAGE_TYPE_REM,
            )
            return if (session.stages.isEmpty()) {
                listOf(HealthTrends.Span(session.startTime, session.endTime))
            } else {
                session.stages.filter { it.stage in sleeping }.map { HealthTrends.Span(it.startTime, it.endTime) }
            }
        }
    }
}
