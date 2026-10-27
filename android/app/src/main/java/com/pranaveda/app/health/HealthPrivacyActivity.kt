package com.pranaveda.app.health

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pranaveda.app.ui.theme.PranaVedaTheme
import com.pranaveda.app.ui.theme.Pv

/**
 * What PranaVeda does with Health Connect data. Health Connect shows this from
 * its permission screen ("Read privacy policy"); an app that reads health data
 * must have it.
 */
class HealthPrivacyActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PranaVedaTheme {
                Column(
                    Modifier.fillMaxSize().background(Pv.background).safeDrawingPadding().verticalScroll(rememberScrollState()).padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Text("Your health data in PranaVeda", style = Pv.display, color = Pv.ink)
                    Text(
                        "PranaVeda reads three things from Health Connect: your sleep sessions, resting heart rate, and heart-rate variability, for the last two weeks.",
                        style = Pv.body, color = Pv.stone700,
                    )
                    Text(
                        "It uses them for the Heart & sleep charts in Recovery & Trends, drawn beside your practice days so you can see how practice and recovery move together.",
                        style = Pv.body, color = Pv.stone700,
                    )
                    Text(
                        "If you turn on \"Let Amrita see my sleep and heart readings\", each message to Amrita also carries a short summary: last night's sleep, resting heart rate and heart-rate variability, each beside your usual. It goes to PranaVeda's server and to Amrita, which runs on Anthropic's Claude, and PranaVeda does not store it. It is off until you turn it on.",
                        style = Pv.body, color = Pv.stone700,
                    )
                    Text(
                        "Otherwise they are read on this phone and stay on it. PranaVeda never sends your daily readings themselves to anyone, and does not write anything to Health Connect.",
                        style = Pv.body, color = Pv.stone700,
                    )
                    Text(
                        "You can stop PranaVeda reading them at any time in Health Connect's app permissions.",
                        style = Pv.body, color = Pv.stone700,
                    )
                }
            }
        }
    }
}
