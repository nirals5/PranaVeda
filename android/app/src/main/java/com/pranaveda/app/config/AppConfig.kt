package com.pranaveda.app.config

import com.pranaveda.app.BuildConfig
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

object AppConfig {
    /** The PranaVeda API, from `pv.apiBaseUrl` in local.properties (see app/build.gradle.kts). */
    val apiBaseUrl: HttpUrl = BuildConfig.PV_API_BASE_URL.toHttpUrl()

    /**
     * Whether the API is on this network (the Mac's dev server) rather than
     * the internet. Android 17 asks the user before an app may reach it.
     */
    val apiIsOnLocalNetwork: Boolean = isLocalHost(apiBaseUrl.host)

    internal fun isLocalHost(host: String): Boolean =
        host == "localhost" || host.endsWith(".local") ||
            host.startsWith("10.") || host.startsWith("192.168.") ||
            Regex("""^172\.(1[6-9]|2\d|3[01])\.""").containsMatchIn(host)

    /**
     * Image addresses from the API are either full addresses or paths on the
     * API's own site ("/poses/cobra.jpg"); paths are resolved against it.
     */
    fun resolve(address: String?, base: HttpUrl = apiBaseUrl): String? {
        if (address.isNullOrEmpty()) return null
        if (address.startsWith("/")) return base.resolve(address)?.toString()
        return address.toHttpUrlOrNull()?.toString() ?: address
    }
}
