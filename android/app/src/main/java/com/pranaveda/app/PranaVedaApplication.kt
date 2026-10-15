package com.pranaveda.app

import android.app.Application
import com.pranaveda.app.auth.AccountApi
import com.pranaveda.app.auth.AuthStore
import com.pranaveda.app.auth.CredentialManagerGoogle
import com.pranaveda.app.auth.KeystoreSessionStorage

/** Holds what the whole app shares: the one sign-in session. */
class PranaVedaApplication : Application() {
    val auth: AuthStore by lazy {
        AuthStore(
            api = AccountApi(),
            storage = KeystoreSessionStorage(this),
            google = CredentialManagerGoogle(this),
            device = { AuthStore.deviceDescription(this) },
        )
    }
}
