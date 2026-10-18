package com.pranaveda.app.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pranaveda.app.R

/**
 * PranaVeda's look, from figma-tokens.json and DESIGN.md (the same palette as
 * the iOS app's Theme.swift).
 *
 * Type is the website's: Playfair Display for headings and quotes, Plus
 * Jakarta Sans for everything else (bundled in res/font, SIL Open Font
 * License). Labels stay monospaced, as on the website's cards.
 *
 * Every size is in sp, so all text follows the reader's font-size setting.
 */
object Pv {
    /** Variable fonts: each weight is a setting of the one file. */
    val serif = FontFamily(
        Font(R.font.playfair_display, FontWeight.Normal),
        Font(R.font.playfair_display, FontWeight.Medium),
        Font(R.font.playfair_display, FontWeight.SemiBold),
        Font(R.font.playfair_display, FontWeight.Bold),
        Font(R.font.playfair_display_italic, FontWeight.Normal, FontStyle.Italic),
        Font(R.font.playfair_display_italic, FontWeight.Medium, FontStyle.Italic),
        Font(R.font.playfair_display_italic, FontWeight.SemiBold, FontStyle.Italic),
        Font(R.font.playfair_display_italic, FontWeight.Bold, FontStyle.Italic),
    )
    val sans = FontFamily(
        Font(R.font.plus_jakarta_sans, FontWeight.Light),
        Font(R.font.plus_jakarta_sans, FontWeight.Normal),
        Font(R.font.plus_jakarta_sans, FontWeight.Medium),
        Font(R.font.plus_jakarta_sans, FontWeight.SemiBold),
        Font(R.font.plus_jakarta_sans, FontWeight.Bold),
        Font(R.font.plus_jakarta_sans_italic, FontWeight.Light, FontStyle.Italic),
        Font(R.font.plus_jakarta_sans_italic, FontWeight.Normal, FontStyle.Italic),
        Font(R.font.plus_jakarta_sans_italic, FontWeight.Medium, FontStyle.Italic),
        Font(R.font.plus_jakarta_sans_italic, FontWeight.SemiBold, FontStyle.Italic),
        Font(R.font.plus_jakarta_sans_italic, FontWeight.Bold, FontStyle.Italic),
    )

    val lavender = Color(0xFF8A79A5)
    val lavenderDeep = Color(0xFF71608E)
    val lavenderTint = Color(0xFFE8E1F2)
    val peachTint = Color(0xFFFBEDE9)
    val mintTint = Color(0xFFDDF5EE)
    val blueTint = Color(0xFFDFE8FA)
    val terracotta = Color(0xFFA66C5E)
    val sage = Color(0xFF6A9478)
    val ink = Color(0xFF2D3436)
    val stone700 = Color(0xFF44515A)
    val stone500 = Color(0xFF78909C)
    val stone200 = Color(0xFFCFD8DC)
    val warmWhite = Color(0xFFF5F3EF)

    val display = TextStyle(fontFamily = serif, fontSize = 34.sp, lineHeight = 41.sp)
    val headingLarge = TextStyle(fontFamily = serif, fontSize = 22.sp, lineHeight = 28.sp)
    val heading = TextStyle(fontFamily = serif, fontSize = 20.sp, lineHeight = 25.sp)
    val body = TextStyle(fontFamily = sans, fontSize = 17.sp, lineHeight = 24.sp)
    val bodySmall = TextStyle(fontFamily = sans, fontSize = 15.sp, lineHeight = 20.sp)

    /** Names under pose pictures and on answer options. */
    val itemTitle = TextStyle(fontFamily = sans, fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
    val caption = TextStyle(fontFamily = sans, fontSize = 12.sp, lineHeight = 16.sp)

    /** Small uppercase monospace labels, as on the web app's cards. */
    /** Quotes and reflective lines, set in the serif like the website's. */
    val quote = TextStyle(fontFamily = serif, fontSize = 17.sp, lineHeight = 24.sp, fontStyle = FontStyle.Italic)

    val label = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.9.sp)

    /** The soft wash behind every screen: white at the bottom left into peach and lavender. */
    val background = Brush.linearGradient(
        colors = listOf(Color.White, peachTint, lavenderTint),
        start = Offset(0f, Float.POSITIVE_INFINITY),
        end = Offset(Float.POSITIVE_INFINITY, 0f),
    )
}

private val colors = lightColorScheme(
    primary = Pv.lavenderDeep,
    onPrimary = Color.White,
    secondary = Pv.lavender,
    secondaryContainer = Pv.lavenderTint,
    onSecondaryContainer = Pv.ink,
    background = Pv.warmWhite,
    onBackground = Pv.ink,
    surface = Pv.warmWhite,
    onSurface = Pv.ink,
    onSurfaceVariant = Pv.stone700,
    surfaceContainer = Color.White,
    error = Pv.terracotta,
)

/** Material's own text (buttons, dialogs, anything without a Pv style) in the sans too. */
private val typography = Typography().run {
    copy(
        displayLarge = displayLarge.copy(fontFamily = Pv.serif),
        displayMedium = displayMedium.copy(fontFamily = Pv.serif),
        displaySmall = displaySmall.copy(fontFamily = Pv.serif),
        headlineLarge = headlineLarge.copy(fontFamily = Pv.serif),
        headlineMedium = headlineMedium.copy(fontFamily = Pv.serif),
        headlineSmall = headlineSmall.copy(fontFamily = Pv.serif),
        titleLarge = titleLarge.copy(fontFamily = Pv.serif),
        titleMedium = titleMedium.copy(fontFamily = Pv.sans),
        titleSmall = titleSmall.copy(fontFamily = Pv.sans),
        bodyLarge = bodyLarge.copy(fontFamily = Pv.sans),
        bodyMedium = bodyMedium.copy(fontFamily = Pv.sans),
        bodySmall = bodySmall.copy(fontFamily = Pv.sans),
        labelLarge = labelLarge.copy(fontFamily = Pv.sans),
        labelMedium = labelMedium.copy(fontFamily = Pv.sans),
        labelSmall = labelSmall.copy(fontFamily = Pv.sans),
    )
}

/** Light only: the system's dark theme does not change the design. */
@Composable
fun PranaVedaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}

private val cardShape = RoundedCornerShape(16.dp)

/** The frosted card surface used throughout. */
fun Modifier.cardSurface(): Modifier = this
    .shadow(14.dp, cardShape, ambientColor = Pv.lavender.copy(alpha = 0.12f), spotColor = Pv.lavender.copy(alpha = 0.2f))
    .background(Color.White.copy(alpha = 0.75f), cardShape)
    .border(1.dp, Color.White.copy(alpha = 0.8f), cardShape)
    .padding(16.dp)
