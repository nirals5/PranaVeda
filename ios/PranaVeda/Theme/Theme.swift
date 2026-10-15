import SwiftUI

/// PranaVeda's look, from figma-tokens.json and DESIGN.md.
///
/// Prototype note: the web app uses Playfair Display (headings) and Plus
/// Jakarta Sans (body). Until those font files are bundled, the system serif
/// (New York) and the system sans stand in.
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

    static func display(_ size: CGFloat = 34) -> Font { .system(size: size, weight: .regular, design: .serif) }
    static func heading(_ size: CGFloat = 20) -> Font { .system(size: size, weight: .regular, design: .serif) }
    static let body = Font.system(size: 16, weight: .light)
    static let bodySmall = Font.system(size: 14, weight: .light)
    /// Small uppercase monospace labels, as on the web app's cards.
    static let label = Font.system(size: 11, weight: .bold, design: .monospaced)

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
        self.font(Theme.label).tracking(0.9).textCase(.uppercase).foregroundStyle(Theme.stone500)
    }
}
