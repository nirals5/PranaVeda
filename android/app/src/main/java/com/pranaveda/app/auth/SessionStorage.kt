package com.pranaveda.app.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.pranaveda.app.model.PvJson
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Where a signed-in session is kept between launches: the refresh token,
 * encrypted with a key that never leaves this device's Android Keystore, and
 * the account's public details alongside, so the app shows the person as
 * signed in straight away, even offline. Access tokens live in memory only;
 * they last 15 minutes.
 */
interface SessionStorage {
    var refreshToken: String?
    var user: AccountUser?
}

class KeystoreSessionStorage(context: Context) : SessionStorage {
    // Excluded from backups (res/xml/backup_rules.xml): the key that decrypts
    // the token cannot be restored on another device anyway.
    private val prefs = context.getSharedPreferences("pranaveda_session", Context.MODE_PRIVATE)

    override var refreshToken: String?
        get() = prefs.getString(TOKEN_KEY, null)?.let { runCatching { decrypt(it) }.getOrNull() }
        set(value) {
            prefs.edit().apply {
                if (value == null) remove(TOKEN_KEY) else putString(TOKEN_KEY, encrypt(value))
            }.apply()
        }

    override var user: AccountUser?
        get() = prefs.getString(USER_KEY, null)?.let { runCatching { PvJson.decodeFromString(AccountUser.serializer(), it) }.getOrNull() }
        set(value) {
            prefs.edit().apply {
                if (value == null) remove(USER_KEY) else putString(USER_KEY, PvJson.encodeToString(AccountUser.serializer(), value))
            }.apply()
        }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
        }.generateKey()
    }

    /** "iv:ciphertext", both Base64. */
    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return b64(cipher.iv) + ":" + b64(sealed)
    }

    private fun decrypt(stored: String): String {
        val (iv, sealed) = stored.split(":", limit = 2).map { Base64.decode(it, Base64.NO_WRAP) }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
        return String(cipher.doFinal(sealed), Charsets.UTF_8)
    }

    private fun b64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "pranaveda_session_key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TOKEN_KEY = "refresh_token"
        const val USER_KEY = "account_user"
    }
}

/** For tests. */
class InMemorySessionStorage(
    override var refreshToken: String? = null,
    override var user: AccountUser? = null,
) : SessionStorage
