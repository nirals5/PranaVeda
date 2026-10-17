package com.pranaveda.app

import android.app.Application
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.auth.CredentialManagerGoogle
import com.pranaveda.app.auth.KeystoreSessionStorage
import com.pranaveda.app.model.DailyInsightStore
import com.pranaveda.app.model.PracticeStore
import com.pranaveda.app.model.SavedRitualStore
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

    val saved: SavedRitualStore by lazy { SavedRitualStore(File(filesDir, "saved-rituals.json"), appScope) }

    /** Kept for as long as the app runs, so the reflection is asked for once per launch. */
    val insight: DailyInsightStore by lazy { DailyInsightStore() }

    val auth: AuthStore by lazy {
        AuthStore(
            api = AccountApi(),
            storage = KeystoreSessionStorage(this),
            google = CredentialManagerGoogle(this),
            device = { AuthStore.deviceDescription(this) },
        )
    }
}
