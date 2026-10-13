import React from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Watch } from 'lucide-react';
import ChartFrame from './ChartFrame';
import { HealthDay, PracticeLogEntry } from '../types';
import { localDateKey, parseDateKey } from '../hooks/usePracticeLog';

interface WearableTrendsProps {
  days: HealthDay[];
  practiceLog: PracticeLogEntry[];
}

const DAYS_SHOWN = 14;
const SERIES = '#8A79A5';
const AXIS = { stroke: '#90A4AE', fontSize: 10, tickLine: false, axisLine: false } as const;
const tooltipStyle = { backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #ECEFF1', fontSize: '11px' };

const shortDate = (key: string) => parseDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const hoursLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

// One measure per chart, each on its own scale — three small multiples over
// the same fortnight rather than mixed units on shared axes.
function Panel({ title, latest, children }: { title: string; latest?: string; children: (size: { width: number; height: number }) => React.ReactElement }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider font-mono text-stone-500 font-bold">{title}</span>
        {latest && <span className="text-[13px] font-sans text-[#2D3436]">{latest}</span>}
      </div>
      <div className="h-36 min-w-0 w-full bg-white/50 rounded-xl p-2 border border-stone-100/50">
        <ChartFrame height={128}>{children}</ChartFrame>
      </div>
    </div>
  );
}

// Real readings from connected wearables. Renders nothing until there are some.
export default function WearableTrends({ days, practiceLog }: WearableTrendsProps) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const fortnight = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (DAYS_SHOWN - 1 - i));
    const key = localDateKey(d);
    const day = byDate.get(key);
    return {
      label: shortDate(key),
      restingHeartRate: day?.restingHeartRate ?? null,
      hrv: day?.hrv ?? null,
      sleepHours: day?.sleepMinutes ? Math.round((day.sleepMinutes / 60) * 10) / 10 : null,
      sleepMinutes: day?.sleepMinutes ?? null,
    };
  });
  const sessions = practiceLog
    .filter((e) => e.heart)
    .slice(-10)
    .map((e) => ({
      label: shortDate(e.localDate),
      title: e.title,
      change: e.heart!.endBpm - e.heart!.startBpm,
      start: e.heart!.startBpm,
      end: e.heart!.endBpm,
    }));

  const has = (key: 'restingHeartRate' | 'hrv' | 'sleepHours') => fortnight.some((d) => d[key] !== null);
  if (!has('restingHeartRate') && !has('hrv') && !has('sleepHours') && !sessions.length) return null;

  const last = <K extends 'restingHeartRate' | 'hrv' | 'sleepMinutes'>(key: K) =>
    [...fortnight].reverse().find((d) => d[key] !== null)?.[key] ?? null;
  const lastResting = last('restingHeartRate');
  const lastHrv = last('hrv');
  const lastSleep = last('sleepMinutes');

  const line = (key: 'restingHeartRate' | 'hrv', unit: string, name: string) => ({ width, height }: { width: number; height: number }) => (
    <LineChart data={fortnight} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECEFF1" />
      <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={24} />
      <YAxis {...AXIS} domain={['dataMin - 4', 'dataMax + 4']} allowDecimals={false} />
      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} ${unit}`, name]} />
      <Line type="monotone" dataKey={key} name={name} stroke={SERIES} strokeWidth={2} dot={{ r: 3, fill: SERIES, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
    </LineChart>
  );

  return (
    <section
      aria-label="Readings from your devices"
      className="mb-8 bg-white/45 backdrop-blur-md border border-white/70 p-5 sm:p-6 rounded-3xl shadow-xs min-w-0 space-y-5"
    >
      <div>
        <span className="flex items-center gap-1.5 text-[12px] font-mono tracking-widest text-[#8A79A5] uppercase font-bold">
          <Watch className="w-3.5 h-3.5" /> From your devices
        </span>
        <h3 className="text-lg font-serif font-light text-[#2D3436] mt-1">The last two weeks, as your wearables saw them</h3>
        <p className="text-xs text-stone-600 font-sans mt-1">Wellness signals, not medical measurements. Kept on this device.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {has('restingHeartRate') && (
          <Panel title="Resting heart rate" latest={lastResting ? `${lastResting} bpm` : undefined}>
            {line('restingHeartRate', 'bpm', 'Resting heart rate')}
          </Panel>
        )}
        {has('hrv') && (
          <Panel title="Overnight HRV" latest={lastHrv ? `${lastHrv} ms` : undefined}>
            {line('hrv', 'ms', 'HRV')}
          </Panel>
        )}
        {has('sleepHours') && (
          <Panel title="Sleep" latest={lastSleep ? hoursLabel(lastSleep) : undefined}>
            {({ width, height }) => (
              <BarChart data={fortnight} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECEFF1" />
                <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...AXIS} domain={[0, 'dataMax + 1']} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#ECEFF1', opacity: 0.5 }}
                  contentStyle={tooltipStyle}
                  formatter={(_, __, item: any) => [hoursLabel(item.payload.sleepMinutes), 'Sleep']}
                />
                <Bar dataKey="sleepHours" name="Sleep" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive={false} />
              </BarChart>
            )}
          </Panel>
        )}
      </div>

      {sessions.length > 0 && (
        <Panel
          title="Heart rate change across each practice"
          latest={`${sessions[sessions.length - 1].start} → ${sessions[sessions.length - 1].end} bpm`}
        >
          {({ width, height }) => (
            <BarChart data={sessions} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECEFF1" />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <ReferenceLine y={0} stroke="#90A4AE" />
              <Tooltip
                cursor={{ fill: '#ECEFF1', opacity: 0.5 }}
                contentStyle={tooltipStyle}
                labelFormatter={(label, items: any) => `${items?.[0]?.payload?.title ?? ''} · ${label}`}
                formatter={(_, __, item: any) => [`${item.payload.start} → ${item.payload.end} bpm`, 'Start to finish']}
              />
              <Bar dataKey="change" name="Change in bpm" fill={SERIES} radius={[4, 4, 4, 4]} maxBarSize={16} isAnimationActive={false} />
            </BarChart>
          )}
        </Panel>
      )}

      <details className="text-[12px] font-sans text-stone-600">
        <summary className="cursor-pointer font-mono uppercase tracking-wider text-[11px] font-bold text-stone-500">View as table</summary>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left">
            <thead>
              <tr className="text-stone-500">
                <th className="font-medium py-1 pr-4">Date</th>
                <th className="font-medium py-1 pr-4">Resting heart rate</th>
                <th className="font-medium py-1 pr-4">HRV</th>
                <th className="font-medium py-1 pr-4">Sleep</th>
              </tr>
            </thead>
            <tbody>
              {fortnight.map((d) => (
                <tr key={d.label} className="border-t border-stone-200/50">
                  <td className="py-1 pr-4">{d.label}</td>
                  <td className="py-1 pr-4">{d.restingHeartRate !== null ? `${d.restingHeartRate} bpm` : '—'}</td>
                  <td className="py-1 pr-4">{d.hrv !== null ? `${d.hrv} ms` : '—'}</td>
                  <td className="py-1 pr-4">{d.sleepMinutes !== null ? hoursLabel(d.sleepMinutes) : '—'}</td>
                </tr>
              ))}
              {sessions.map((s, i) => (
                <tr key={`s-${i}`} className="border-t border-stone-200/50">
                  <td className="py-1 pr-4">{s.label}</td>
                  <td className="py-1 pr-4" colSpan={3}>
                    {s.title}: {s.start} → {s.end} bpm
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
