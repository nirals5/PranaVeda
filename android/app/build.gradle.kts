import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// The PranaVeda API the app talks to. The emulator reaches the Mac's dev
// server (npm run dev, port 3000) at 10.0.2.2. For a phone on the same Wi-Fi,
// put the Mac's network name in local.properties (not committed):
//   pv.apiBaseUrl=http://Your-Mac.local:3000
val localProperties = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
val apiBaseUrl: String = localProperties.getProperty("pv.apiBaseUrl") ?: "http://10.0.2.2:3000"

// Google sign-in. Android's Credential Manager issues ID tokens for the WEB
// OAuth client (the server accepts it as VITE_GOOGLE_CLIENT_ID), so that is the
// id the app asks for. Google recognises the app itself through the separate
// Android OAuth client (package com.pranaveda.app + the signing key's SHA-1),
// which is not referenced here. Client ids are public, not secrets.
val googleWebClientId: String = localProperties.getProperty("pv.googleWebClientId")
    ?: "163737232285-a82gbd3vfmlmles1v6cnlnn5ub21vld1.apps.googleusercontent.com"

android {
    namespace = "com.pranaveda.app"
    compileSdk {
        version = release(37) { minorApiLevel = 2 }
    }

    defaultConfig {
        applicationId = "com.pranaveda.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "PV_API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "PV_GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // JVM unit tests: Android framework calls return defaults instead of
    // throwing, so a stand-in Context can be passed where one is required.
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
