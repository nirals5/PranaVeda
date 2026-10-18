import Testing
import UIKit
@testable import PranaVeda

/// The website's typefaces are bundled and registered, so the theme's fonts
/// are the real ones rather than a silent fallback to the system's.
struct FontsTests {
    @Test func bundledTypefacesAreRegistered() {
        #expect(UIFont.familyNames.contains(Theme.serifFamily))
        #expect(UIFont.familyNames.contains(Theme.sansFamily))
        for name in ["PlayfairDisplay-Regular", "PlayfairDisplay-Italic", "PlusJakartaSans-Regular", "PlusJakartaSans-Italic"] {
            #expect(UIFont(name: name, size: 17) != nil, "\(name) is not registered")
        }
    }

    @Test func italicAndBoldStayInTheFamily() {
        let serif = UIFontDescriptor(name: "PlayfairDisplay-Regular", size: 17)
        let italic = UIFont(descriptor: serif.withSymbolicTraits(.traitItalic)!, size: 17)
        #expect(italic.familyName == Theme.serifFamily)
        #expect(italic.fontDescriptor.symbolicTraits.contains(.traitItalic))
        let sans = UIFontDescriptor(name: "PlusJakartaSans-Regular", size: 17)
        let bold = UIFont(descriptor: sans.withSymbolicTraits(.traitBold)!, size: 17)
        #expect(bold.familyName == Theme.sansFamily)
        #expect(bold.fontDescriptor.symbolicTraits.contains(.traitBold))
    }
}
