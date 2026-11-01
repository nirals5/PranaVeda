import SwiftUI

/// Details this phone has that the account doesn't (see ProfileOffer), as on
/// the website's home screen. They stay out of sight until Review, then open
/// in place.
struct ProfileOfferBar: View {
    let model: ChatViewModel
    let offer: ProfileOffer
    @State private var open = false
    @State private var saving = false
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Text(offer.summary).font(Theme.bodySmall).foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !open {
                    Button("Review") { open = true }.buttonStyle(PillButton(primary: true))
                }
            }
            if open {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(offer.items, id: \.self) { item in
                        Text("• \(item)").font(Theme.bodySmall).foregroundStyle(Theme.ink)
                    }
                }
                if failed {
                    Text("That couldn't be saved. Please try again.").font(Theme.bodySmall).foregroundStyle(Theme.stone700)
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { choices }
                    VStack(alignment: .leading, spacing: 8) { choices }
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Theme.lavenderTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder private var choices: some View {
        Button("Add to my account") {
            saving = true
            failed = false
            Task {
                failed = !(await model.addProfileOffer())
                saving = false
            }
        }
        .buttonStyle(PillButton(primary: true))
        .disabled(saving)
        Button("Not now") { model.declineProfileOffer(offer) }
            .buttonStyle(PillButton(primary: false))
            .disabled(saving)
    }
}
