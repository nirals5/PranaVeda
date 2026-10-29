import SwiftUI

/// "You have 40 open minutes, until 9:35 PM", with Practice now, as on the
/// website's home screen (src/components/FreeTimeNudge.tsx). Shown only in
/// open calendar time the rules allow; dismissing hides it for that opening.
struct FreeTimeBar: View {
    let calendar: CalendarStore
    let onPractice: (String) -> Void
    @AppStorage("pranaveda_free_time_dismissed") private var dismissedKey = ""

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            if let slot = calendar.openSlot(now: context.date), slot.key != dismissedKey {
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: "clock").foregroundStyle(Theme.lavenderDeep).accessibilityHidden(true)
                    Text(FreeTime.describe(slot)).font(Theme.bodySmall).foregroundStyle(Theme.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button("Practice now") { onPractice(FreeTime.practiceNow(slot)) }
                        .buttonStyle(PillButton(primary: true))
                    Button { dismissedKey = slot.key } label: {
                        Image(systemName: "xmark").font(.caption.weight(.semibold)).foregroundStyle(Theme.stone500)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Dismiss")
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Theme.lavenderTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }
}
