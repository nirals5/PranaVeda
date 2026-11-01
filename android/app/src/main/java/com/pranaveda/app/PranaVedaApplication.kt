package com.pranaveda.app

import com.pranaveda.app.calendar.CalendarStore
import com.pranaveda.app.health.HealthStore
import com.pranaveda.app.health.HeartSensor
import com.pranaveda.app.place.ArrivalStore
import com.pranaveda.app.place.ConnectionsSync
import com.pranaveda.app.place.PlaceStore
import android.app.Application
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.auth.CredentialManagerGoogle
import com.pranaveda.app.auth.KeystoreSessionStorage
import com.pranaveda.app.model.DailyInsightStore
import com.pranaveda.app.model.PracticeStore
import com.pranaveda.app.model.SavedRitualStore
import com.pranaveda.app.voice.AmritaVoice
import com.pranaveda.app.voice.HeyAmrita
import com.pranaveda.app.widget.WidgetBridge
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File

/** Holds what the whole app shares: the one sign-in session, the practice log, saved rituals and today's reflection. */
class PranaVedaApplication : Application() {
    /** Lives as long as the app: practice-log saves and syncs finish even if a screen closes. */
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    val practice: PracticeStore by lazy {
        PracticeStore(
            api = AccountApi(),
            prefs = getSharedPreferences("pranaveda", MODE_PRIVATE),
            file = File(filesDir, "practice-log.json"),
            scope = appScope,
        ).also { it.auth = auth }
    }

    val saved: SavedRitualStore by lazy {
        SavedRitualStore(
            file = File(filesDir, "saved-rituals.json"),
            scope = appScope,
            prefs = getSharedPreferences("pranaveda", MODE_PRIVATE),
            api = AccountApi(),
        ).also { it.auth = auth }
    }

    /** Heart and sleep readings from Health Connect, for Recovery & Trends. */
    val health: HealthStore by lazy { HealthStore(this) }

    /** A Bluetooth heart-rate sensor, for live readings during a practice. */
    val heartSensor: HeartSensor by lazy { HeartSensor(this) }

    /** Saved places (home, work, …), matched while the app is open. */
    val place: PlaceStore by lazy {
        PlaceStore(this).also {
            it.onChange = {
                arrival.refresh()
                connections.placesChanged()
            }
        }
    }

    /** Saved places on the account, once turned on. */
    val connections: ConnectionsSync by lazy {
        ConnectionsSync(AccountApi(), getSharedPreferences("pranaveda", MODE_PRIVATE), place, appScope).also { it.auth = auth }
    }

    /** Arrival reminders: the phone watches the saved places, even with the app closed. */
    val arrival: ArrivalStore by lazy { ArrivalStore(this) }

    /** The phone's calendar, read for busy and free time, and free-time reminders. */
    val calendar: CalendarStore by lazy { CalendarStore(this) }

    /** Amrita's spoken replies, shared so a new message or screen can stop them. */
    val voice: AmritaVoice by lazy { AmritaVoice(this, appScope) }

    /** "Hey Amrita" while the app is open (opt-in), shared by the chat and the practice screens. */
    val heyAmrita: HeyAmrita by lazy { HeyAmrita(this) }

    /** Kept for as long as the app runs, so the reflection is asked for once per launch. */
    val insight: DailyInsightStore by lazy { DailyInsightStore() }

    override fun onCreate() {
        super.onCreate()
        // The home-screen widgets show what the app knows; keep them in step.
        WidgetBridge.start(this)
        // Free-time reminders keep running once turned on.
        calendar.resume()
    }

    val auth: AuthStore by lazy {
        AuthStore(
            api = AccountApi(),
            storage = KeystoreSessionStorage(this),
            google = CredentialManagerGoogle(this),
            device = { AuthStore.deviceDescription(this) },
        )
    }
}
