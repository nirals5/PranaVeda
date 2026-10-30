import SwiftUI

/// Turn location on, then mark the spots that matter, as on the website.
/// Amrita learns only the kind of place (home, work, …); the copy says so,
/// because that is the promise.
struct LocationSettings: View {
    let place: PlaceStore
    let arrival: ArrivalStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Location").sectionLabel().accessibilityAddTraits(.isHeader)
            Text("A practice that fits where you are").font(Theme.heading()).foregroundStyle(Theme.ink)
            Text("While PranaVeda is open, it checks where you are against spots you save here. Amrita is told only the kind of place, such as home or work. Your coordinates stay on this phone and no history is kept.")
                .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            HStack(alignment: .center, spacing: 12) {
                Text(status).font(Theme.quote.italic()).foregroundStyle(Theme.stone700)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.updatesFrequently)
                if place.blocked {
                    Button("Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
                        .buttonStyle(PillButton(primary: false))
                } else {
                    Button(place.enabled ? "Turn off" : "Turn on") { place.enabled ? place.disable() : place.enable() }
                        .buttonStyle(PillButton(primary: !place.enabled))
                }
            }
            if place.enabled && !place.blocked {
                ForEach(PlaceKind.allCases) { kind in
                    Divider().overlay(Theme.stone200)
                    row(kind)
                }
                if place.places.contains(where: { Arrival.kinds.contains($0.kind) }) {
                    Divider().overlay(Theme.stone200)
                    arrivalRow
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private var status: String {
        if place.blocked { return "Location is off for PranaVeda. Allow it in Settings, then come back." }
        if !place.enabled { return "Off. Amrita does not know where you are." }
        if !place.located { return "Finding where you are…" }
        if place.imprecise {
            return place.approximateOnly
                ? "PranaVeda can see only your approximate location, too vague to tell your places apart. Turn on Precise Location for PranaVeda in Settings."
                : "Your phone can only give a rough area right now, too vague to tell your places apart."
        }
        if let current = place.current { return "Right now: \(current.label)." }
        return "Located. Save the spot you are in below so Amrita can recognise it."
    }

    /// Arrival reminders, once a place that takes them is saved.
    private var arrivalRow: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Arrival reminders").font(Theme.serif(.body)).foregroundStyle(Theme.ink)
                Text(arrivalDetail).font(Theme.caption).foregroundStyle(Theme.stone500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if arrival.notificationsBlocked || (arrival.on && arrival.needsAlways) {
                Button("Settings") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
                    .buttonStyle(PillButton(primary: false))
            }
            if !arrival.notificationsBlocked {
                Button(arrival.on ? "Turn off" : "Turn on") { Task { await arrival.setOn(!arrival.on) } }
                    .buttonStyle(PillButton(primary: !arrival.on))
                    .accessibilityLabel(arrival.on ? "Turn off arrival reminders" : "Turn on arrival reminders")
            }
        }
    }

    private var arrivalDetail: String {
        if arrival.notificationsBlocked { return "Notifications are off for PranaVeda. Allow them in Settings." }
        if arrival.on && arrival.needsAlways {
            return "Set Location to Always for PranaVeda in Settings, so your phone can notice when you arrive."
        }
        return "A gentle note when you arrive home, at the studio or at your outdoor spot and stay a few minutes. Your phone notices the arrival, even with PranaVeda closed. Between 7 AM and 10 PM, at most every three hours."
    }

    private func row(_ kind: PlaceKind) -> some View {
        let saved = place.places.contains { $0.kind == kind }
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(kind.label).font(Theme.serif(.body)).foregroundStyle(Theme.ink)
                Text(saved ? (place.current == .saved(kind) ? "Saved. You are here now." : "Saved.") : "Not saved yet.")
                    .font(Theme.caption).foregroundStyle(Theme.stone500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(saved ? "Move here" : "I am here") { place.save(kind) }
                .buttonStyle(PillButton(primary: !saved))
                .disabled(!place.located || place.imprecise)
                .accessibilityLabel("\(saved ? "Move" : "Save") \(kind.label) to where I am now")
            if saved {
                Button("Remove") { place.remove(kind) }
                    .buttonStyle(PillButton(primary: false))
                    .accessibilityLabel("Remove \(kind.label)")
            }
        }
    }
}

/// The website's small rounded action buttons.
struct PillButton: ButtonStyle {
    let primary: Bool
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .labelFont().tracking(0.9).textCase(.uppercase)
            .lineLimit(1).fixedSize()
            .foregroundStyle(primary ? .white : Theme.stone700)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(primary ? Theme.lavender : Color.white.opacity(0.6), in: Capsule())
            .overlay(Capsule().stroke(primary ? .clear : Theme.stone200, lineWidth: 1))
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.5)
    }
}
