import Charts
import SwiftUI

/// Recovery & Trends, part two: sleep, resting heart rate and HRV from
/// Apple Health over the last 14 days, with practice days shaded, so how
/// practice and recovery move together shows at a glance. Real readings
/// only, read on the phone.
struct HealthTrendsSection: View {
    let health: HealthStore
    /// "YYYY-MM-DD" of every day with a practice.
    let practiceDays: Set<String>
    @State private var watchHeart = WatchHeart.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Heart & sleep").font(Theme.heading()).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            switch health.state {
            case .unavailable:
                Text("Apple Health is not available on this device.").font(Theme.bodySmall).foregroundStyle(Theme.stone700)
            case .notConnected, .failed:
                Text("See your sleep, resting heart rate and heart-rate variability beside your practice. PranaVeda reads them from Apple Health on this phone, and they stay on it unless you choose to let Amrita see them.")
                    .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
                Button { Task { await health.connect() } } label: {
                    Label("Connect Apple Health", systemImage: "heart.text.square")
                        .labelFont().tracking(0.9).textCase(.uppercase)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18).padding(.vertical, 12)
                        .background(Theme.lavender, in: Capsule())
                }
                if health.state == .failed {
                    Text("Apple Health could not be opened just now. Please try again.").font(Theme.caption).foregroundStyle(Theme.terracotta)
                }
            case .loading:
                ProgressView().tint(Theme.lavender).frame(maxWidth: .infinity, alignment: .leading)
            case .loaded(let days):
                if days.allSatisfy(\.isEmpty) {
                    Text("No sleep or heart readings in Apple Health for the last two weeks. An Apple Watch or a sleep app records them; you can also check what PranaVeda may read in Settings › Health › Data Access.")
                        .font(Theme.bodySmall).foregroundStyle(Theme.stone700)
                } else {
                    charts(days)
                }
                shareWithAmrita
            }
            if watchHeart.watchReady || watchHeart.enabled { watchDuringPractice }
        }
        .task { await health.load() }
    }

    /// Heart rate from Apple Watch during a guided practice; only offered
    /// with PranaVeda on a paired watch.
    private var watchDuringPractice: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(get: { watchHeart.enabled }, set: { on in Task { await watchHeart.setEnabled(on) } })) {
                Text("Heart rate from Apple Watch during practice").font(Theme.body).foregroundStyle(Theme.ink)
            }
            .tint(Theme.lavender)
            Text(watchHeart.blocked
                 ? "Apple Health didn't allow it. Allow PranaVeda to save workouts and read heart rate in Settings › Health › Data Access, then try again."
                 : "A guided practice opens PranaVeda on your watch, shows your heart rate as you go, and saves the start, end and average with the practice. Each finished practice is also saved to Apple Health as a Mind and Body workout.")
                .font(Theme.caption).foregroundStyle(watchHeart.blocked ? Theme.terracotta : Theme.stone500)
        }
        .padding(.top, 4)
    }

    /// The opt-in: off until they turn it on.
    private var shareWithAmrita: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(get: { health.sharesWithAmrita }, set: { health.sharesWithAmrita = $0 })) {
                Text("Let Amrita see my sleep and heart readings").font(Theme.body).foregroundStyle(Theme.ink)
            }
            .tint(Theme.lavender)
            Text("With each message, Amrita gets a short summary: last night's sleep, resting heart rate and heart-rate variability, each beside your usual. It goes to PranaVeda's server and to Amrita, which runs on Anthropic's Claude, and PranaVeda does not store it. Off, your readings stay on this phone.")
                .font(Theme.caption).foregroundStyle(Theme.stone500)
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private func charts(_ days: [HealthDay]) -> some View {
        Text("Shaded days: you practised.").font(Theme.caption).foregroundStyle(Theme.stone500)
        metric("Sleep", latest: days.last(where: { $0.sleepMinutes != nil })?.sleepMinutes.map(HealthTrends.hours), days: days,
               value: { $0.sleepMinutes.map { Double($0) / 60 } }, unit: "hours", bars: true)
        metric("Resting heart rate", latest: days.last(where: { $0.restingHeartRate != nil })?.restingHeartRate.map { "\(Int($0.rounded())) bpm" },
               days: days, value: \.restingHeartRate, unit: "beats per minute", bars: false)
        metric("Heart-rate variability (SDNN)", latest: days.last(where: { $0.hrv != nil })?.hrv.map { "\(Int($0.rounded())) ms" },
               days: days, value: \.hrv, unit: "milliseconds", bars: false)
    }

    private func metric(_ title: String, latest: String?, days: [HealthDay], value: @escaping (HealthDay) -> Double?, unit: String, bars: Bool) -> some View {
        let readings = days.compactMap { day in value(day).map { (day: day, value: $0) } }
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).labelFont().textCase(.uppercase).foregroundStyle(Theme.stone500)
                Spacer()
                if let latest { Text(latest).font(Theme.bodySmall).foregroundStyle(Theme.ink) }
            }
            if readings.isEmpty {
                Text("No readings").font(Theme.caption).foregroundStyle(Theme.stone500)
            } else {
                Chart {
                    // Practice days, shaded behind the readings.
                    ForEach(days.filter { practiceDays.contains($0.key) }) { day in
                        RectangleMark(x: .value("Day", day.date, unit: .day))
                            .foregroundStyle(Theme.lavenderTint.opacity(0.7))
                            .accessibilityHidden(true)
                    }
                    ForEach(readings, id: \.day.key) { reading in
                        if bars {
                            BarMark(x: .value("Day", reading.day.date, unit: .day), y: .value(title, reading.value))
                                .foregroundStyle(Theme.lavender)
                                .accessibilityLabel(reading.day.date.formatted(.dateTime.weekday(.wide).month().day()))
                                .accessibilityValue(String(format: "%.1f \(unit)", reading.value) + (practiceDays.contains(reading.day.key) ? ", practised" : ""))
                        } else {
                            LineMark(x: .value("Day", reading.day.date, unit: .day), y: .value(title, reading.value))
                                .foregroundStyle(Theme.lavender)
                                .interpolationMethod(.monotone)
                            PointMark(x: .value("Day", reading.day.date, unit: .day), y: .value(title, reading.value))
                                .foregroundStyle(Theme.lavenderDeep)
                                .symbolSize(18)
                                .accessibilityLabel(reading.day.date.formatted(.dateTime.weekday(.wide).month().day()))
                                .accessibilityValue("\(Int(reading.value.rounded())) \(unit)" + (practiceDays.contains(reading.day.key) ? ", practised" : ""))
                        }
                    }
                }
                .chartXScale(domain: days.first!.date...Calendar.autoupdatingCurrent.date(byAdding: .day, value: 1, to: days.last!.date)!)
                .chartXAxis { AxisMarks(values: .stride(by: .day, count: 7)) { _ in AxisValueLabel(format: .dateTime.month(.abbreviated).day()) } }
                .chartYScale(domain: .automatic(includesZero: bars))
                .frame(height: 100)
            }
        }
    }
}
