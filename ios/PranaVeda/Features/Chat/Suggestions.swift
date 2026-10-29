import SwiftUI

/// The suggestions under the welcome, as on the website's home screen
/// (src/App.tsx): where they are first when location is on, then two common
/// feelings, then the dosha discovery until a constitution is on file.
enum Suggestions {
    /// The website's words for each place (PLACE_SUGGESTION in src/hooks/usePlace.ts).
    static func forPlace(_ place: CurrentPlace) -> String {
        switch place {
        case .saved(.home): "I'm at home with room to use the floor. What would you suggest?"
        case .saved(.work): "I'm at work. Something quiet I can do at my desk, please."
        case .saved(.studio): "I'm at the studio with a mat and space. Guide me through a fuller practice."
        case .saved(.outdoors): "I'm outdoors. A standing practice I can do here, please."
        case .elsewhere: "I'm out and about. Something I can do anywhere, no mat needed."
        }
    }

    static func list(place: CurrentPlace?, knowsConstitution: Bool) -> [String] {
        (place.map { [forPlace($0)] } ?? []) + [
            "I haven't been sleeping well lately",
            "I feel stressed and overwhelmed",
            knowsConstitution ? "Help me create a morning yoga practice" : "Help me discover my dosha profile",
        ]
    }
}

/// Tapping one sends it to Amrita as their own words.
struct SuggestionChips: View {
    let suggestions: [String]
    let onSelect: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(suggestions, id: \.self) { text in
                Button { onSelect(text) } label: {
                    Text(text)
                        .font(Theme.body)
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.leading)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Color.white.opacity(0.55), in: Capsule())
                        .overlay(Capsule().stroke(Color.white.opacity(0.8)))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Lays children out in rows, wrapping onto the next row when one is full.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(for: subviews, width: proposal.width ?? .infinity)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(for: subviews, width: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func rows(for subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil))
            if !current.indices.isEmpty, current.width + spacing + size.width > width {
                rows.append(current)
                current = Row()
            }
            current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            current.height = max(current.height, size.height)
            current.indices.append(index)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}
