import AVKit
import SwiftUI

/// Library → Flows: the follow-along videos by group. A tile plays its video
/// full screen.
struct FlowsSection: View {
    let flows: [Flow]
    @State private var playing: Flow?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Flows").font(Theme.heading(.title2)).foregroundStyle(Theme.ink)
                Text("Short guided sequences to practise along with.")
                    .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            }
            ForEach(flows.grouped, id: \.group) { group in
                Text(group.group).sectionLabel()
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14, alignment: .top)], spacing: 18) {
                    ForEach(group.flows) { flow in
                        Button { playing = flow } label: { FlowTile(flow: flow) }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Play \(flow.title), \(flow.minutes) minutes")
                            .siriShows(FlowEntity.self, id: flow.id)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
        .fullScreenCover(item: $playing) { FlowPlayerView(flow: $0) }
    }
}

struct FlowTile: View {
    let flow: Flow

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            PoseImage(url: flow.coverURL)
                .frame(height: 110)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    Image(systemName: "play.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.lavender)
                        .frame(width: 40, height: 40)
                        .background(.white.opacity(0.85), in: Circle())
                }
            Text(flow.title).font(Theme.itemTitle).foregroundStyle(Theme.ink).lineLimit(2)
            Text("\(flow.minutes) min").sectionLabel()
        }
    }
}

/// On a pose page: the flows that feature the pose.
struct PoseFlowLinks: View {
    let flows: [Flow]
    @State private var playing: Flow?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Watch a flow with this pose").sectionLabel()
            ForEach(flows) { flow in
                Button { playing = flow } label: {
                    HStack(spacing: 12) {
                        PoseImage(url: flow.coverURL)
                            .frame(width: 88, height: 50)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(flow.title).font(Theme.bodySmall).foregroundStyle(Theme.ink).multilineTextAlignment(.leading)
                            Text("\(flow.minutes) min").font(Theme.caption).foregroundStyle(Theme.stone500)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "play.circle.fill").font(.title2).foregroundStyle(Theme.lavender)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Play \(flow.title), \(flow.minutes) minutes")
                .siriShows(FlowEntity.self, id: flow.id)
            }
        }
        .cardSurface()
        .fullScreenCover(item: $playing) { FlowPlayerView(flow: $0) }
    }
}

/// One flow, full screen with the system player controls.
struct FlowPlayerView: View {
    let flow: Flow
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            if let player {
                VideoPlayer(player: player).ignoresSafeArea()
            }
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.black.opacity(0.5), in: Circle())
            }
            .padding(16)
            .accessibilityLabel("Close")
        }
        .onAppear {
            guard player == nil, let url = flow.videoURL else { return }
            // Sound even with the ring switch on silent, like other video apps.
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            let player = AVPlayer(url: url)
            self.player = player
            player.play()
            SiriBridge.flowPlayed(flow)
        }
        // Opened by Siri, the first play() can be dropped: Siri still holds
        // the audio, or the app isn't in front yet. Ask again for the first
        // few seconds, until it has started once; a later pause is theirs.
        .task(id: player == nil) {
            guard let player else { return }
            for _ in 0..<20 {
                if player.timeControlStatus == .playing { return }
                if UIApplication.shared.applicationState == .active {
                    try? AVAudioSession.sharedInstance().setActive(true)
                    player.play()
                }
                try? await Task.sleep(for: .milliseconds(400))
                if Task.isCancelled { return }
            }
        }
        .onDisappear { player?.pause() }
        .siriShows(FlowEntity.self, id: flow.id)
    }
}
