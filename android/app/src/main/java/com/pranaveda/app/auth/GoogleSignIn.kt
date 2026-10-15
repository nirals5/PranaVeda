package com.pranaveda.app.auth

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.pranaveda.app.BuildConfig

/**
 * Asks Google who the person is, and returns Google's signed ID token. The
 * server verifies it (and the nonce in it) before creating a session.
 */
interface GoogleIdentityProvider {
    /** [context] must be an Activity: Google shows its sign-in sheet over it. */
    suspend fun idToken(context: Context, nonce: String): String

    suspend fun signOut()
}

/** The person closed Google's sign-in sheet: a choice, not an error. */
class SignInCancelled : Exception()

/**
 * Google sign-in through Android's Credential Manager. The token is issued for
 * the web OAuth client ([BuildConfig.PV_GOOGLE_WEB_CLIENT_ID]); Google checks
 * the app against the Android OAuth client registered for this package and
 * signing key.
 */
class CredentialManagerGoogle(private val appContext: Context) : GoogleIdentityProvider {
    override suspend fun idToken(context: Context, nonce: String): String {
        val option = GetSignInWithGoogleOption.Builder(BuildConfig.PV_GOOGLE_WEB_CLIENT_ID)
            .setNonce(nonce)
            .build()
        val result = try {
            CredentialManager.create(context).getCredential(context, GetCredentialRequest.Builder().addCredentialOption(option).build())
        } catch (e: GetCredentialCancellationException) {
            throw SignInCancelled()
        }
        val credential = result.credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            return GoogleIdTokenCredential.createFrom(credential.data).idToken
        }
        throw AccountException.Unavailable(0)
    }

    override suspend fun signOut() {
        // Forget which Google account was chosen, so the next sign-in asks again.
        runCatching { CredentialManager.create(appContext).clearCredentialState(ClearCredentialStateRequest()) }
    }
}
