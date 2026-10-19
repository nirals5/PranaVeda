import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// MARK: Practice in progress

/// The practice that is running, on the lock screen and in the Dynamic Island.
/// The app starts, updates and ends it (PracticeLiveActivity); tapping it opens the app.
struct PracticeLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PracticeActivityAttributes.self) { context in
            PracticeLockScreenView(title: context.attributes.title, kind: context.attributes.kind, state: context.state)
                .activityBackgroundTint(WTheme.lavenderTint)
                .activitySystemActionForegroundColor(WTheme.lavenderDeep)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    PracticeGlyph(kind: context.attributes.kind).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    PracticeCountdown(state: context.state)
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .frame(maxWidth: 72, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.step).font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(context.attributes.title) · \(context.state.detail)")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            } compactLeading: {
                PracticeGlyph(kind: context.attributes.kind)
            } compactTrailing: {
                PracticeCountdown(state: context.state)
                    .font(.caption.monospacedDigit())
                    .frame(maxWidth: 44)
            } minimal: {
                PracticeGlyph(kind: context.attributes.kind)
            }
            .keylineTint(WTheme.lavender)
        }
    }
}

struct PracticeLockScreenView: View {
    let title: String
    let kind: String
    let state: PracticeActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 14) {
            PracticeGlyph(kind: kind)
                .font(.title2)
                .frame(width: 44, height: 44)
                .background(Circle().fill(.white.opacity(0.7)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(WTheme.label).tracking(0.8).textCase(.uppercase)
                    .foregroundStyle(WTheme.stone700).lineLimit(1)
                Text(state.step).font(WTheme.serif(19, .headline)).foregroundStyle(WTheme.ink).lineLimit(1)
                Text(state.detail).font(WTheme.sans(13, .caption)).foregroundStyle(WTheme.stone700)
            }
            Spacer(minLength: 8)
            PracticeCountdown(state: state)
                .font(.title2.monospacedDigit().weight(.semibold))
                .foregroundStyle(WTheme.lavenderDeep)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 90, alignment: .trailing)
        }
        .padding(16)
    }
}

/// Counts down on its own while running; shows the time left and "Paused" otherwise.
struct PracticeCountdown: View {
    let state: PracticeActivityAttributes.ContentState

    var body: some View {
        if let endsAt = state.endsAt, endsAt > .now {
            Text(timerInterval: Date.now...endsAt, countsDown: true)
        } else if let left = state.pausedSecondsLeft {
            VStack(alignment: .trailing, spacing: 0) {
                Text(Duration.seconds(left).formatted(.time(pattern: .minuteSecond)))
                Text("Paused").font(.caption2).foregroundStyle(.secondary)
            }
        } else {
            Text("0:00")
        }
    }
}

struct PracticeGlyph: View {
    let kind: String
    var body: some View {
        Image(systemName: kind == "breathwork" ? "wind" : "figure.yoga")
            .foregroundStyle(WTheme.lavender)
            .accessibilityHidden(true)
    }
}

// MARK: Quick buttons

/// Control Center, lock screen and Action button: opens the chat, already listening.
@available(iOS 18.0, *)
struct TalkToAmritaControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "talk") {
            ControlWidgetButton(action: OpenURLIntent(WidgetLink.talk)) {
                Label("Talk to Amrita", systemImage: "mic.fill")
            }
        }
        .displayName("Talk to Amrita")
        .description("Opens PranaVeda ready to listen.")
    }
}
