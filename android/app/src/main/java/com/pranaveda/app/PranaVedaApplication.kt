package com.pranaveda.app

import android.app.Application
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.auth.CredentialManagerGoogle
import com.pranaveda.app.auth.KeystoreSessionStorage
import com.pranaveda.app.model.PracticeStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File

/** Holds what the whole app shares: the one sign-in session and the practice log. */
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

    val auth: AuthStore by lazy {
        AuthStore(
            api = AccountApi(),
            storage = KeystoreSessionStorage(this),
            google = CredentialManagerGoogle(this),
            device = { AuthStore.deviceDescription(this) },
        )
    }
}
