import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { PracticeLogEntry, RecommendationResult } from '../types';
import { localDateKey, parseDateKey } from '../hooks/usePracticeLog';

interface PracticeCalendarProps {
  entries: PracticeLogEntry[];
  streak: number;
  onOpenRitual: (result: RecommendationResult) => void;
  onStartPractice: () => void;
}

// 1 Jan 2023 was a Sunday — used only to read localized weekday names.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(2023, 0, 1 + i);
  return {
    short: d.toLocaleDateString(undefined, { weekday: 'short' }),
    long: d.toLocaleDateString(undefined, { weekday: 'long' }),
  };
});

const KIND_LABEL: Record<PracticeLogEntry['kind'], string> = {
  ritual: 'Ritual',
  breathwork: 'Breathwork',
};

// Ritual is a filled dot, breathwork a hollow ring: shape carries the meaning,
// so the markers still read on the selected (lavender) day and without color.
function Marker({ kind, inverted }: { kind: PracticeLogEntry['kind']; inverted?: boolean }) {
  const tone = inverted ? 'border-white' : 'border-[#8A79A5]';
  const fill = kind === 'ritual' ? (inverted ? 'bg-white' : 'bg-[#8A79A5]') : 'bg-transparent';
  return <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full border ${tone} ${fill}`} />;
}

export default function PracticeCalendar({ entries, streak, onOpenRitual, onStartPractice }: PracticeCalendarProps) {
  const todayKey = localDateKey(new Date());
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const focusSelectedRef = useRef(false);

  const byDay = useMemo(() => {
    const map = new Map<string, PracticeLogEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.localDate);
      if (list) list.push(entry);
      else map.set(entry.localDate, [entry]);
    }
    return map;
  }, [entries]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = viewMonth.getDay();
  const dayKeys = Array.from({ length: daysInMonth }, (_, i) => localDateKey(new Date(year, month, i + 1)));

  const monthCount = dayKeys.reduce((sum, key) => sum + (byDay.get(key)?.length ?? 0), 0);
  // Roving tab stop: the selected day, or the 1st when another month is in view.
  const tabStopKey = dayKeys.includes(selectedKey) ? selectedKey : dayKeys[0];

  const selectDate = (date: Date) => {
    setSelectedKey(localDateKey(date));
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  // After arrow-key navigation, move focus with the selection (possibly into
  // a month that has only just rendered).
  useEffect(() => {
    if (!focusSelectedRef.current) return;
    focusSelectedRef.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${selectedKey}"]`)?.focus();
  }, [selectedKey, viewMonth]);

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const from = (e.target as HTMLElement).dataset.date ?? selectedKey;
    const next = parseDateKey(from);
    next.setDate(next.getDate() + step);
    focusSelectedRef.current = true;
    selectDate(next);
  };

  const selectedDate = parseDateKey(selectedKey);
  const selectedEntries = byDay.get(selectedKey) ?? [];
  const selectedIsFuture = selectedKey > todayKey;

  const navButton =
    'w-9 h-9 flex items-center justify-center rounded-full bg-white/50 hover:bg-white/80 border border-white/70 text-stone-600 hover:text-stone-900 transition-all cursor-pointer';

  return (
    <div className="w-full max-w-5xl mx-auto px-5 sm:px-6 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 items-start">
        {/* Month */}
        <section
          aria-label="Practice calendar"
          className="bg-white/60 backdrop-blur-lg border border-white/80 rounded-[28px] p-5 sm:p-8 shadow-[0_16px_44px_rgba(138,121,165,0.14)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5 min-w-0">
              <span className="inline-flex items-center gap-1.5 p-1 px-3 rounded-full text-[11px] font-mono tracking-widest font-bold bg-[#E8E1F2] text-stone-700 uppercase">
                <CalendarDays className="w-3 h-3 text-[#8A79A5]" /> Practice calendar
              </span>
              <h1 className="text-3xl sm:text-4xl font-serif text-[#2D3436]" aria-live="polite">
                {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </h1>
              <p className="text-[11px] font-mono text-stone-500 uppercase tracking-wider">
                {monthCount} {monthCount === 1 ? 'practice' : 'practices'} this month
                {streak > 0 && ` · ${streak}-day streak`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => selectDate(new Date())}
                className="py-2 px-4 rounded-full text-[11px] font-mono uppercase tracking-wider text-stone-500 hover:text-stone-800 bg-white/50 hover:bg-white/80 border border-white/70 transition-all cursor-pointer"
              >
                Today
              </button>
              <button type="button" aria-label="Previous month" onClick={() => setViewMonth(new Date(year, month - 1, 1))} className={navButton}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" aria-label="Next month" onClick={() => setViewMonth(new Date(year, month + 1, 1))} className={navButton}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2 mt-7 mb-2">
            {WEEKDAYS.map((day) => (
              <span key={day.long} className="text-center text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500">
                <span aria-hidden="true">{day.short}</span>
                <span className="sr-only">{day.long}</span>
              </span>
            ))}
          </div>

          <div ref={gridRef} onKeyDown={handleGridKeyDown} className="grid grid-cols-7 gap-1 sm:gap-2">
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {dayKeys.map((key, i) => {
              const dayEntries = byDay.get(key) ?? [];
              const selected = key === selectedKey;
              const isToday = key === todayKey;
              const label = `${parseDateKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${
                isToday ? ', today' : ''
              }, ${dayEntries.length ? `${dayEntries.length} ${dayEntries.length === 1 ? 'practice' : 'practices'}` : 'no practice'}`;
              return (
                <button
                  key={key}
                  type="button"
                  data-date={key}
                  tabIndex={key === tabStopKey ? 0 : -1}
                  aria-label={label}
                  aria-pressed={selected}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => setSelectedKey(key)}
                  className={`aspect-square flex flex-col items-center justify-center gap-1 rounded-2xl border text-[14px] font-sans transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#8A79A5]/90 border-transparent text-white'
                      : `hover:bg-white/70 ${isToday ? 'border-[#8A79A5]/60 font-semibold text-[#2D3436]' : 'border-transparent'} ${
                          key > todayKey ? 'text-stone-500' : 'text-[#2D3436]'
                        }`
                  }`}
                >
                  <span>{i + 1}</span>
                  <span className="flex items-center gap-0.5 h-1.5">
                    {dayEntries.slice(0, 3).map((entry) => (
                      <Marker key={entry.id} kind={entry.kind} inverted={selected} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-5 mt-6 pt-5 border-t border-stone-200/50 text-[11px] font-mono uppercase tracking-wider text-stone-500">
            <span className="flex items-center gap-1.5"><Marker kind="ritual" /> Ritual</span>
            <span className="flex items-center gap-1.5"><Marker kind="breathwork" /> Breathwork</span>
          </div>
        </section>

        {/* Selected day */}
        <section
          aria-live="polite"
          className="bg-white/50 border border-white/30 p-6 rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.02)] backdrop-blur-md"
        >
          <span className="text-xs text-stone-500/80 uppercase font-mono tracking-wider font-bold">
            {selectedKey === todayKey ? 'Today' : selectedIsFuture ? 'Ahead' : 'That day'}
          </span>
          <h2 className="text-2xl font-serif text-[#2D3436] mt-1.5">
            {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h2>

          {selectedEntries.length > 0 ? (
            <ul className="mt-5 divide-y divide-stone-200/50">
              {selectedEntries.map((entry) => (
                <li key={entry.id} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                  <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-stone-500">
                    <Marker kind={entry.kind} />
                    {KIND_LABEL[entry.kind]} · {new Date(entry.completedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ·{' '}
                    {entry.durationMinutes} min
                  </p>
                  <p className="text-[17px] font-serif text-[#2D3436] leading-snug">{entry.title}</p>
                  {entry.heart && (
                    <p className="text-[13.5px] font-sans text-stone-600">
                      Heart rate {entry.heart.startBpm} → {entry.heart.endBpm} bpm
                      {entry.heart.rmssd ? ` · HRV ${entry.heart.rmssd} ms` : ''}
                    </p>
                  )}
                  {entry.result && (
                    <button
                      type="button"
                      onClick={() => onOpenRitual(entry.result!)}
                      className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider font-bold text-[#71608E] hover:text-[#2D3436] transition-colors cursor-pointer"
                    >
                      Open ritual <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-5 space-y-5">
              <p className="text-[15px] font-serif italic text-stone-600 leading-relaxed">
                {selectedIsFuture
                  ? 'This day has not arrived yet.'
                  : selectedKey === todayKey
                    ? 'Nothing practiced yet today. Finishing a ritual or a breathwork session marks the day.'
                    : 'No practice was recorded on this day.'}
              </p>
              {selectedKey === todayKey && (
                <button
                  type="button"
                  onClick={onStartPractice}
                  className="py-3 px-6 bg-[#8A79A5] hover:bg-[#72618F] text-white text-[12px] uppercase tracking-widest font-mono font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                >
                  Begin with Amrita <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
