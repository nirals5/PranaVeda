// Renders the iOS app icon from the website's lotus (src/assets/pranaveda_icon.svg):
// the lotus centred on a soft wash in the app's palette, as an opaque
// 1024×1024 PNG (App Store icons may not be transparent).
//
// Run from ios/:  swift scripts/make-app-icon.swift
import AppKit
import ImageIO

let source = URL(fileURLWithPath: "../src/assets/pranaveda_icon.svg")
let output = URL(fileURLWithPath: "PranaVeda/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")
let size = 1024

guard let lotus = NSImage(contentsOf: source) else { fatalError("Could not read \(source.path)") }

// An RGB context with no alpha channel, so the PNG has none either.
guard let context = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
) else { fatalError("Could not create the drawing context") }

func color(_ hex: UInt32) -> NSColor {
    NSColor(deviceRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
NSGraphicsContext.current?.imageInterpolation = .high
let canvas = NSRect(x: 0, y: 0, width: size, height: size)

// Background: warm white into the app's peach and lavender tints, matching
// the gradient behind every screen (Theme.background).
NSGradient(colors: [color(0xFFFFFF), color(0xFBEDE9), color(0xE8E1F2)])!
    .draw(in: canvas, angle: 45)

// The lotus at about 64% of the width, centred, a little above the middle
// so it reads as optically centred.
let width = CGFloat(size) * 0.64
let height = width * lotus.size.height / lotus.size.width
let rect = NSRect(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - height) / 2 + CGFloat(size) * 0.02,
                  width: width, height: height)
lotus.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)

NSGraphicsContext.restoreGraphicsState()

guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(output as CFURL, "public.png" as CFString, 1, nil)
else { fatalError("Could not encode the PNG") }
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("Could not write \(output.path)") }
print("Wrote \(output.path) (\(size)×\(size), no transparency)")
