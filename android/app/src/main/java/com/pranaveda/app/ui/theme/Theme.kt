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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * PranaVeda's look, from figma-tokens.json and DESIGN.md (the same palette as
 * the iOS app's Theme.swift).
 *
 * Prototype note: the web app uses Playfair Display (headings) and Plus
 * Jakarta Sans (body). Until those font files are bundled, the system serif
 * and sans stand in.
 *
 * Every size is in sp, so all text follows the reader's font-size setting.
 */
object Pv {
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

    val display = TextStyle(fontFamily = FontFamily.Serif, fontSize = 34.sp, lineHeight = 41.sp)
    val headingLarge = TextStyle(fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 28.sp)
    val heading = TextStyle(fontFamily = FontFamily.Serif, fontSize = 20.sp, lineHeight = 25.sp)
    val body = TextStyle(fontSize = 17.sp, lineHeight = 24.sp)
    val bodySmall = TextStyle(fontSize = 15.sp, lineHeight = 20.sp)

    /** Names under pose pictures and on answer options. */
    val itemTitle = TextStyle(fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
    val caption = TextStyle(fontSize = 12.sp, lineHeight = 16.sp)

    /** Small uppercase monospace labels, as on the web app's cards. */
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

/** Light only: the system's dark theme does not change the design. */
@Composable
fun PranaVedaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = Typography(), content = content)
}

private val cardShape = RoundedCornerShape(16.dp)

/** The frosted card surface used throughout. */
fun Modifier.cardSurface(): Modifier = this
    .shadow(14.dp, cardShape, ambientColor = Pv.lavender.copy(alpha = 0.12f), spotColor = Pv.lavender.copy(alpha = 0.2f))
    .background(Color.White.copy(alpha = 0.75f), cardShape)
    .border(1.dp, Color.White.copy(alpha = 0.8f), cardShape)
    .padding(16.dp)
