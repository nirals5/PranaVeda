import SwiftUI

/// PranaVeda's look, from figma-tokens.json and DESIGN.md.
///
/// Type is the website's: Playfair Display for headings and quotes, Plus
/// Jakarta Sans for everything else (bundled in Fonts/, registered in
/// project.yml). Labels stay monospaced, as on the website's cards.
///
/// Every font is tied to an iOS text style, so all text follows the reader's
/// text-size setting (Settings → Display & Brightness → Text Size), including
/// the larger accessibility sizes.
enum Theme {
    static let lavender = Color(hex: 0x8A79A5)
    static let lavenderDeep = Color(hex: 0x71608E)
    static let lavenderTint = Color(hex: 0xE8E1F2)
    static let peachTint = Color(hex: 0xFBEDE9)
    static let mintTint = Color(hex: 0xDDF5EE)
    static let blueTint = Color(hex: 0xDFE8FA)
    static let terracotta = Color(hex: 0xA66C5E)
    static let ink = Color(hex: 0x2D3436)
    static let stone700 = Color(hex: 0x44515A)
    static let stone500 = Color(hex: 0x78909C)
    static let stone200 = Color(hex: 0xCFD8DC)
    static let warmWhite = Color(hex: 0xF5F3EF)

    static let serifFamily = "Playfair Display"
    static let sansFamily = "Plus Jakarta Sans"

    /// Each text style's size at the default text size, which iOS then scales.
    static func baseSize(_ style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: 34
        case .title: 28
        case .title2: 22
        case .title3: 20
        case .headline, .body: 17
        case .callout: 16
        case .subheadline: 15
        case .footnote: 13
        case .caption: 12
        case .caption2: 11
        @unknown default: 17
        }
    }

    static func serif(_ style: Font.TextStyle) -> Font { .custom(serifFamily, size: baseSize(style), relativeTo: style) }
    static func sans(_ style: Font.TextStyle) -> Font { .custom(sansFamily, size: baseSize(style), relativeTo: style) }

    static let display = serif(.largeTitle)
    static func heading(_ style: Font.TextStyle = .title3) -> Font { serif(style) }
    /// Quotes and reflective lines, set in the serif like the website's.
    static let quote = serif(.body)
    static let body = sans(.body)
    static let bodySmall = sans(.subheadline)
    /// Names under pose pictures and on answer options.
    static let itemTitle = sans(.subheadline).weight(.medium)
    static let caption = sans(.caption)
    /// Small uppercase monospace labels, as on the web app's cards.
    static let label = Font.system(.caption, design: .monospaced, weight: .bold)

    /// The soft wash behind every screen.
    static let background = LinearGradient(
        colors: [.white, peachTint, lavenderTint],
        startPoint: .bottomLeading,
        endPoint: .topTrailing
    )
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// The frosted card surface used throughout.
struct CardSurface: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(.white.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(.white.opacity(0.8)))
            .shadow(color: Theme.lavender.opacity(0.12), radius: 18, y: 10)
    }
}

extension View {
    func cardSurface() -> some View { modifier(CardSurface()) }

    func sectionLabel() -> some View {
        self.labelFont().tracking(0.9).textCase(.uppercase).foregroundStyle(Theme.stone500)
    }

    /// The small uppercase label type. Labels are short markers, so they grow
    /// with the reader's text size up to the first accessibility size and no
    /// further; past that they would break mid-word. Body text and headings
    /// keep growing.
    func labelFont() -> some View {
        self.font(Theme.label).dynamicTypeSize(...DynamicTypeSize.accessibility1)
    }
}
