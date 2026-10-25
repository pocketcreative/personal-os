'use client';
import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import Panel from '@/components/ui/Panel';
import { useStats, type Period, type Point } from '@/lib/useScorecardApi';

const pctText = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);

/** Heat colour: 0% pale red through the ok green at 100%. */
function heatColor(pct: number | null): string {
  if (pct === null) return 'var(--ink-2)';
  if (pct === 0) return 'color-mix(in oklch, var(--danger) 25%, var(--ink-1))';
  return `color-mix(in oklch, var(--ok) ${Math.max(18, Math.round(pct))}%, var(--ink-1))`;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ font: "800 24px/1.1 'Archivo', sans-serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Bars({ rows, label }: { rows: Period[]; label: (k: string) => string }) {
  if (rows.length === 0) return <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Nothing yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {[...rows].reverse().map((r) => (
        <li key={r.key} className="flex items-center gap-3" style={{ fontSize: 13 }}>
          <span style={{ width: 84, color: 'var(--ink-3)' }}>{label(r.key)}</span>
          <span style={{ flex: 1, height: 12, borderRadius: 6, background: 'var(--ink-2)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${r.avg}%`, background: 'var(--ok)' }} />
          </span>
          <span style={{ width: 40, textAlign: 'right', fontWeight: 600 }}>{pctText(r.avg)}</span>
        </li>
      ))}
    </ul>
  );
}

function TrendChart({ points, threshold }: { points: Point[]; threshold: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || points.length === 0) return;
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: points.map((p) => p.date.slice(5)),
        datasets: [
          { label: 'Daily %', data: points.map((p) => p.pct), borderColor: '#4b7a4f', backgroundColor: '#4b7a4f', tension: 0.25, pointRadius: 2, spanGaps: false },
          { label: `Target ${threshold}%`, data: points.map(() => threshold), borderColor: '#9a7a2e', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } }, x: { ticks: { maxTicksLimit: 6 } } },
        plugins: { legend: { display: false } },
      },
    });
    return () => chart.destroy();
  }, [points, threshold]);
  return <div style={{ height: 180 }}><canvas ref={ref} /></div>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ProgressView({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { stats, error } = useStats();
  if (!stats) return <p style={{ color: 'var(--ink-3)' }}>{error ?? 'Loading…'}</p>;
  const s = stats.summary;
  const firstLogged = stats.firstLogged ?? '9999';

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <div className="grid grid-cols-5 gap-2">
          <Summary label="Today" value={pctText(s.today)} />
          <Summary label="7 days" value={pctText(s.last7)} />
          <Summary label="30 days" value={pctText(s.last30)} />
          <Summary label="All time" value={pctText(s.allTime)} />
          <Summary label={`Streak ≥${stats.threshold}%`} value={`${s.streak}d`} />
        </div>
      </Panel>

      <Panel title="Last 26 weeks">
        {/* Column-flow grid: 7 rows (Mon–Sun), 26 equal columns so every week fits any width. */}
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateColumns: 'repeat(26, 1fr)', gridTemplateRows: 'repeat(7, auto)', gap: 3 }}>
          {stats.heat.map((c) => (
            <button
              key={c.date} onClick={() => onOpenDay(c.date)}
              title={`${c.date}: ${pctText(c.date < firstLogged ? null : c.pct)}`}
              aria-label={`${c.date} ${pctText(c.pct)}`}
              style={{ aspectRatio: '1', borderRadius: 3, background: heatColor(c.date < firstLogged ? null : c.pct), padding: 0 }}
            />
          ))}
        </div>
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>Tap a day to open it. Grey = before you started.</p>
      </Panel>

      <Panel title="Last 30 days">
        <TrendChart points={stats.last30} threshold={stats.threshold} />
      </Panel>

      <Panel title="By week"><Bars rows={stats.weeks} label={(k) => `Wk of ${k.slice(8)} ${MONTHS[Number(k.slice(5, 7)) - 1]}`} /></Panel>
      <Panel title="By month"><Bars rows={stats.months} label={(k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`} /></Panel>
      <Panel title="By year"><Bars rows={stats.years} label={(k) => k} /></Panel>

      <Panel title="Habit hit rate, last 30 days">
        {stats.habitRates.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stats.habitRates.map((h) => (
              <li key={h.name} style={{ fontSize: 13 }}>
                <div className="flex justify-between"><span>{h.name}</span><b>{Math.round(h.pct)}%</b></div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--ink-2)', marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${h.pct}%`, background: h.pct >= stats.threshold ? 'var(--ok)' : 'var(--danger)' }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>Worst first. Counts days you logged; a skipped day scores 0% in the daily numbers above.</p>
      </Panel>
    </div>
  );
}
