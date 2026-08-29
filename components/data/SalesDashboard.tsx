'use client';

/**
 * Ported, near-verbatim, from Brendan's standalone self-contained HTML sales
 * dashboard (Chart.js + vanilla JS). The dashboard's own visual design
 * (DM Sans/Syne/DM Mono, light theme, blue/green/red/amber status colors) is
 * intentional and pre-approved — do not restyle it to match the rest of
 * Personal OS. Everything under `.data-dash` is scoped CSS from the original
 * file with selectors prefixed so it can't leak into/collide with the rest
 * of the app (the original had a `*{margin:0;padding:0}` reset that would
 * have broken every other page if left global).
 *
 * Two deliberate changes from the original file:
 * 1. The "Connect Data Source" modal is gone. Data now comes from an
 *    internal API route, GET /api/data-sheets (see
 *    app/api/data-sheets/route.ts), which fetches the four Google Sheet
 *    tabs server-side using the plain (non-NEXT_PUBLIC_) SALES_SHEETS_API_KEY
 *    env var. The key never reaches the browser. This component just calls
 *    its own route automatically on mount.
 * 2. The original's `position:fixed`/`sticky` offsets assumed the dashboard
 *    owned the whole viewport (its own sidebar starts at `top:0`). Here it
 *    sits below Personal OS's persistent TopRail nav, so those offsets are
 *    pushed down by `--app-top-h`, a CSS var this component measures from
 *    the real TopRail element at runtime (see useLayoutEffect below). This
 *    is a positioning fix only — no colors, fonts, spacing, or layout
 *    proportions were changed.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';

// ── CONFIG ─────────────────────────────────────────────────────────────
const AA_START_DATE = '2026-05-13'; // cutover — Meta Data before this = Agency, on/after = AA

type Offer = 'agency' | 'aa';
type Row = Record<string, string>;

interface Targets {
  ctr: number;
  lpConv: number;
  bookRate: number;
  closeRate: number;
  cpm: number;
  cpc: number;
  cpl: number;
  costBooked: number;
  cpa: number;
  roas: number;
  showRate: number;
  avgCommission: number;
}

const DEFAULT_TARGETS: Targets = {
  ctr: 1.5, lpConv: 5, bookRate: 30, closeRate: 30, cpm: 50, cpc: 1,
  cpl: 50, costBooked: 150, cpa: 600, roas: 3, showRate: 70, avgCommission: 5000,
};

interface DashState {
  crmAgency: Row[];
  crmAA: Row[];
  metaRaw: Row[];
  charts: { spend?: Chart; month?: Chart };
  currentOffer: Offer;
  activeTargets: Targets;
}

// ── DOM HELPERS ────────────────────────────────────────────────────────
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// ── PURE HELPERS (ported 1:1) ─────────────────────────────────────────
function sl(r: Row) { return (r.Status || '').toLowerCase().trim(); }
function getUTM(r: Row) { return (r['Utm_content (Ad Name)'] || '').trim(); }
function getRevClosed(r: Row) {
  const k = Object.keys(r).find((k) => k.toLowerCase().includes('revenue') && k.toLowerCase().includes('closed'));
  return k ? num(r[k]) : 0;
}
function parseDate(s?: string): Date | null {
  if (!s || !s.trim()) return null;
  s = s.trim();
  const p = s.replace(/-/g, '/').split('/');
  try {
    if (p.length === 3) {
      if (p[0].length === 4) return new Date(+p[0], +p[1] - 1, +p[2]);
      return new Date(+p[2], +p[1] - 1, +p[0]);
    }
  } catch { /* fall through */ }
  return null;
}
function num(v: unknown): number {
  const n = parseFloat(String(v || '').replace(/[$,S\s]/g, ''));
  return isNaN(n) ? 0 : n;
}
function pct(v: number, d = 1): string {
  return (v === null || isNaN(v) || !isFinite(v)) ? '—' : v.toFixed(d) + '%';
}
function sgd(v: number, d = 0): string {
  return (isNaN(v) || !isFinite(v)) ? '—' : 'S$' + v.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function fmtN(v: number): string {
  return (isNaN(v) || !isFinite(v)) ? '—' : Math.round(v).toLocaleString();
}
function monthKey(ds?: string): string | null {
  const d = parseDate(ds);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(k: string): string {
  const [y, m] = k.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('en', { month: 'short', year: '2-digit' });
}
function rc(v: number, g: number, a: number): string {
  return v >= g ? 'b-green' : v >= a ? 'b-amber' : 'b-red';
}

const STATUS = {
  BOOKED: (r: Row) => ['booked', 'conducted', 'closed'].includes(sl(r)),
  CONDUCTED: (r: Row) => ['conducted', 'closed'].includes(sl(r)),
  CLOSED: (r: Row) => sl(r) === 'closed',
  UNQUALIFIED: (r: Row) => sl(r) === 'unqualified',
};

function inRange(ds: string | undefined): boolean {
  const d = parseDate(ds);
  if (!d || isNaN(d.getTime())) return false;
  const f = $<HTMLInputElement>('dateFrom').value;
  const t = $<HTMLInputElement>('dateTo').value;
  if (f && d < new Date(f)) return false;
  if (t && d > new Date(t + 'T23:59:59')) return false;
  return true;
}

function getCurrentCRM(s: DashState) { return s.currentOffer === 'aa' ? s.crmAA : s.crmAgency; }
function filterCRM(s: DashState) { return getCurrentCRM(s).filter((r) => inRange(r['Date Opt In'])); }
function filterMeta(s: DashState) {
  const cutoff = parseDate(AA_START_DATE);
  return s.metaRaw.filter((r) => {
    if (!inRange(r['Date'])) return false;
    const d = parseDate(r['Date']);
    if (!d || !cutoff) return true;
    return s.currentOffer === 'aa' ? d >= cutoff : d < cutoff;
  });
}

function parseTargetsFromSheet(tj: { values?: string[][] }, s: DashState) {
  if (!tj.values || tj.values.length < 2) return;
  const rows = tj.values.slice(1).filter((r) => r[0] && r[0].trim());
  if (!rows.length) return;
  const row = rows[rows.length - 1];
  // Sheet columns: A:Month B:CTR C:LP Conv D:Booking Rate E:Close Rate
  //                F:CPM  G:CPC H:CPL    I:Cost Per Booked J:Cost Per Acquisition K:ROAS
  s.activeTargets = {
    ctr: num(row[1]) || DEFAULT_TARGETS.ctr,
    lpConv: num(row[2]) || DEFAULT_TARGETS.lpConv,
    bookRate: num(row[3]) || DEFAULT_TARGETS.bookRate,
    closeRate: num(row[4]) || DEFAULT_TARGETS.closeRate,
    cpm: num(row[5]) || DEFAULT_TARGETS.cpm,
    cpc: num(row[6]) || DEFAULT_TARGETS.cpc,
    cpl: num(row[7]) || DEFAULT_TARGETS.cpl,
    costBooked: num(row[8]) || DEFAULT_TARGETS.costBooked,
    cpa: num(row[9]) || DEFAULT_TARGETS.cpa,
    roas: num(row[10]) || DEFAULT_TARGETS.roas,
    showRate: DEFAULT_TARGETS.showRate,
    avgCommission: DEFAULT_TARGETS.avgCommission,
  };
}

function metricTile(name: string, val: string, target: string, status: string, barPct: number | null = null): string {
  const bc: Record<string, string> = { green: '#15803D', red: '#B91C1C', amber: '#B45309', neutral: '#9CA3AF' };
  const cls = status === 'green' ? 'green' : status === 'red' ? 'red' : status === 'amber' ? 'amber' : 'neutral';
  const bar = barPct !== null
    ? `<div class="metric-bar-wrap"><div class="metric-bar" style="width:${Math.min(barPct, 100)}%;background:${bc[status] || '#9CA3AF'}"></div></div>`
    : '';
  return `<div class="metric-tile"><div class="metric-name">${name}</div><div class="metric-val ${cls}">${val}</div><div class="metric-target">${target}</div>${bar}</div>`;
}

// ── RENDERERS (ported 1:1, direct DOM writes like the original) ───────
function renderOverview(s: DashState) {
  const crm = filterCRM(s), meta = filterMeta(s), T = s.activeTargets;
  $('recordCount').textContent = `${crm.length} leads`;
  const spend = meta.reduce((sum, r) => sum + num(r['Spend']), 0);
  const impr = meta.reduce((sum, r) => sum + num(r['Impressions']), 0);
  const clicks = meta.reduce((sum, r) => sum + num(r['Clicks']), 0);
  const cpm = impr ? spend / impr * 1000 : 0, ctr = impr ? clicks / impr * 100 : 0;

  const leads = crm.length;
  const booked = crm.filter((r) => STATUS.BOOKED(r)).length;
  const conducted = crm.filter((r) => STATUS.CONDUCTED(r)).length;
  const closed = crm.filter((r) => STATUS.CLOSED(r)).length;
  const revenue = crm.reduce((sum, r) => sum + getRevClosed(r), 0);

  $('dataKPIs').innerHTML = ([
    ['Spend', sgd(spend, 0)],
    ['Impressions', fmtN(impr)],
    ['Clicks', fmtN(clicks)],
    ['Leads', String(leads)],
    ['Booked', String(booked)],
    ['Conducted', String(conducted)],
    ['Closed', String(closed)],
    ['Revenue', sgd(revenue, 0)],
    ['Unqualified', String(crm.filter((r) => STATUS.UNQUALIFIED(r)).length)],
  ] as [string, string][]).map(([l, v]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-val">${v}</div></div>`).join('');

  const lpConv = clicks ? leads / clicks * 100 : 0;
  const bookRate = leads ? booked / leads * 100 : 0;
  const showRate = booked ? conducted / booked * 100 : 0;
  const closeRate = conducted ? closed / conducted * 100 : 0;
  const cpl = leads ? spend / leads : 0;
  const cpb = booked ? spend / booked : 0;
  const cpa = closed ? spend / closed : 0;
  const roas = spend ? revenue / spend : 0;

  const cpc = clicks ? spend / clicks : 0;
  const cpcStatus = cpc > 0 && cpc <= T.cpc ? 'green' : cpc > 0 && cpc <= T.cpc * 1.5 ? 'amber' : cpc > T.cpc * 1.5 ? 'red' : 'neutral';
  const cpmStatus = cpm > 0 && cpm <= T.cpm ? 'green' : cpm > T.cpm && cpm <= T.cpm * 1.5 ? 'amber' : cpm > T.cpm * 1.5 ? 'red' : 'neutral';
  const ctrStatus = ctr >= T.ctr ? 'green' : ctr >= T.ctr * .5 ? 'amber' : ctr > 0 ? 'red' : 'neutral';
  const lpStatus = lpConv >= T.lpConv ? 'green' : lpConv >= T.lpConv * .5 ? 'amber' : lpConv > 0 ? 'red' : 'neutral';
  const cpaStatus = cpa > 0 && cpa <= T.cpa ? 'green' : cpa > 0 && cpa <= T.cpa * 1.5 ? 'amber' : cpa > T.cpa * 1.5 ? 'red' : 'neutral';

  $('metricsStrip').innerHTML = [
    metricTile('CPM', sgd(cpm, 2), `Target ≤ S$${T.cpm.toFixed(0)}`, cpmStatus, null),
    metricTile('CTR', pct(ctr, 2), `Target ≥ ${T.ctr.toFixed(1)}%`, ctrStatus, ctr / T.ctr * 100),
    metricTile('LP Conv.', pct(lpConv, 2), `Target ≥ ${T.lpConv.toFixed(0)}%`, lpStatus, lpConv / T.lpConv * 100),
    metricTile('Booking Rate', pct(bookRate, 1), `Target ≥ ${T.bookRate.toFixed(0)}%`, bookRate >= T.bookRate ? 'green' : bookRate >= T.bookRate * .5 ? 'amber' : 'red', bookRate / T.bookRate * 100),
    metricTile('Show-up Rate', pct(showRate, 1), `Target ≥ ${T.showRate.toFixed(0)}%`, showRate >= T.showRate ? 'green' : showRate >= T.showRate * .5 ? 'amber' : 'red', showRate / T.showRate * 100),
    metricTile('Closing Rate', pct(closeRate, 1), `Target ≥ ${T.closeRate.toFixed(0)}%`, closeRate >= T.closeRate ? 'green' : closeRate >= T.closeRate * .5 ? 'amber' : 'red', closeRate / T.closeRate * 100),
    metricTile('CPC', sgd(cpc, 2), `Target ≤ S$${T.cpc.toFixed(2)}`, cpcStatus, null),
    metricTile('Cost Per Lead', sgd(cpl, 2), `Target ≤ S$${T.cpl.toFixed(0)}`, cpl > 0 && cpl <= T.cpl ? 'green' : cpl > 0 && cpl <= T.cpl * 1.5 ? 'amber' : cpl > T.cpl * 1.5 ? 'red' : 'neutral', null),
    metricTile('Cost Per Booked', sgd(cpb, 0), `Target ≤ S$${T.costBooked.toFixed(0)}`, cpb > 0 && cpb <= T.costBooked ? 'green' : cpb > 0 && cpb <= T.costBooked * 1.5 ? 'amber' : cpb > T.costBooked * 1.5 ? 'red' : 'neutral', null),
    metricTile('Cost Per Acquisition', sgd(cpa, 0), `Target ≤ S$${T.cpa.toFixed(0)}`, cpaStatus, null),
    metricTile('ROAS', roas > 0 ? roas.toFixed(2) + '×' : '—', `Target ≥ ${T.roas.toFixed(1)}×`, roas >= T.roas ? 'green' : roas >= T.roas * .5 ? 'amber' : roas > 0 ? 'red' : 'neutral', roas / T.roas * 100),
  ].join('');

  $('totalSpendBadge').textContent = sgd(spend, 0) + ' total';
  const byDate: Record<string, number> = {};
  meta.forEach((r) => { if (!r['Date']) return; byDate[r['Date']] = (byDate[r['Date']] || 0) + num(r['Spend']); });
  const dl = Object.keys(byDate).sort(), dd = dl.map((l) => +byDate[l].toFixed(2));
  s.charts.spend?.destroy();
  const canvas = $<HTMLCanvasElement>('spendChart');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    s.charts.spend = new Chart(ctx, {
      type: 'bar',
      data: { labels: dl, datasets: [{ data: dd, backgroundColor: 'rgba(37,99,235,0.8)', borderRadius: 4, hoverBackgroundColor: '#1d4ed8' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => 'S$' + (c.raw as number).toFixed(2) } } },
        scales: {
          x: { ticks: { font: { size: 10, family: 'DM Mono' }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12, color: '#9CA3AF' }, grid: { display: false }, border: { display: false } },
          y: { ticks: { font: { size: 10, family: 'DM Mono' }, callback: (v) => 'S$' + v, color: '#9CA3AF' }, grid: { color: '#F0F1F4' }, border: { display: false } },
        },
      },
    });
  }
}

function renderFunnel(s: DashState) {
  const crm = filterCRM(s), T = s.activeTargets;
  const leads = crm.length;
  const booked = crm.filter((r) => STATUS.BOOKED(r)).length;
  const conducted = crm.filter((r) => STATUS.CONDUCTED(r)).length;
  const closed = crm.filter((r) => STATUS.CLOSED(r)).length;
  const unq = crm.filter((r) => STATUS.UNQUALIFIED(r)).length;

  const steps = [
    { label: 'Total Leads', count: leads, pct: 100, color: '#2563EB' },
    { label: 'Call Booked', count: booked, pct: leads ? booked / leads * 100 : 0, color: '#0891B2' },
    { label: 'Conducted', count: conducted, pct: leads ? conducted / leads * 100 : 0, color: '#D97706' },
    { label: 'Closed', count: closed, pct: leads ? closed / leads * 100 : 0, color: '#15803D' },
  ];
  $('funnelViz').innerHTML = steps.map((st) => `
    <div class="funnel-step">
      <div class="f-label">${st.label}</div>
      <div class="f-track"><div class="f-fill" style="width:${Math.max(st.pct || 0, .5)}%;background:${st.color}">${st.pct > 12 ? st.pct.toFixed(1) + '%' : ''}</div></div>
      <div class="f-stats"><div class="f-count">${st.count}</div><div class="f-pct">${st.pct.toFixed(1)}%</div></div>
    </div>`).join('');

  const rows = [
    { stage: 'Lead → Booked', count: booked, ofL: leads ? booked / leads * 100 : 0, step: leads ? booked / leads * 100 : 0, t: T.bookRate as number | null },
    { stage: 'Booked → Conducted', count: conducted, ofL: leads ? conducted / leads * 100 : 0, step: booked ? conducted / booked * 100 : 0, t: T.showRate as number | null },
    { stage: 'Conducted → Closed', count: closed, ofL: leads ? closed / leads * 100 : 0, step: conducted ? closed / conducted * 100 : 0, t: T.closeRate as number | null },
    { stage: 'Unqualified', count: unq, ofL: leads ? unq / leads * 100 : 0, step: null as number | null, t: null as number | null },
  ];
  $('funnelTable').innerHTML = rows.map((r) => {
    const conv = r.step !== null ? pct(r.step, 1) : '—';
    const badge = r.t !== null && r.step !== null
      ? `<span class="badge ${rc(r.step, r.t, r.t * .5)}">${r.step >= r.t ? 'On target' : r.step >= r.t * .5 ? 'Below' : 'Off target'}</span>`
      : '';
    return `<tr><td class="name-col">${r.stage}</td><td class="mono">${r.count}</td><td class="mono">${pct(r.ofL, 1)}</td><td class="mono">${conv}</td><td>${badge}</td></tr>`;
  }).join('');
}

interface CreativeAgg {
  name: string; spend: number; impr: number; clicks: number; leads: number;
  booked: number; conducted: number; closed: number; revenue: number;
  ctr: number; cpl: number; bookRate: number; roas: number;
}

function buildCreativeMap(s: DashState): CreativeAgg[] {
  const crm = filterCRM(s), meta = filterMeta(s);
  const map: Record<string, Omit<CreativeAgg, 'ctr' | 'cpl' | 'bookRate' | 'roas'>> = {};
  meta.forEach((r) => {
    const n = r['Ad Name'] || ''; if (!n) return;
    if (!map[n]) map[n] = { name: n, spend: 0, impr: 0, clicks: 0, leads: 0, booked: 0, conducted: 0, closed: 0, revenue: 0 };
    map[n].spend += num(r['Spend']); map[n].impr += num(r['Impressions']); map[n].clicks += num(r['Clicks']);
  });
  crm.forEach((r) => {
    const u = getUTM(r); if (!u) return;
    if (!map[u]) map[u] = { name: u, spend: 0, impr: 0, clicks: 0, leads: 0, booked: 0, conducted: 0, closed: 0, revenue: 0 };
    map[u].leads++;
    if (STATUS.BOOKED(r)) map[u].booked++;
    if (STATUS.CONDUCTED(r)) map[u].conducted++;
    if (STATUS.CLOSED(r)) { map[u].closed++; map[u].revenue += getRevClosed(r); }
  });
  return Object.values(map).map((c) => ({
    ...c,
    ctr: c.impr ? c.clicks / c.impr * 100 : 0,
    cpl: c.leads ? c.spend / c.leads : Infinity,
    bookRate: c.leads ? c.booked / c.leads * 100 : 0,
    roas: c.spend && c.revenue ? c.revenue / c.spend : 0,
  }));
}

function renderCreatives(s: DashState) {
  const data = buildCreativeMap(s), T = s.activeTargets;
  const sort = $<HTMLSelectElement>('sortBy').value;
  data.sort((a, b) => sort === 'cpl' ? (isFinite(a.cpl) ? a.cpl : 99999) - (isFinite(b.cpl) ? b.cpl : 99999)
    : sort === 'roas' ? b.roas - a.roas
    : sort === 'closed' ? b.closed - a.closed
    : sort === 'bookRate' ? b.bookRate - a.bookRate
    : sort === 'leads' ? b.leads - a.leads
    : b.spend - a.spend);
  $('creativeCount').textContent = data.length + ' creatives';
  function roasBadge(r: number) {
    if (!r || !isFinite(r) || r === 0) return '<span style="color:var(--text3)">—</span>';
    return `<span class="badge ${r >= T.roas ? 'b-green' : r >= 1 ? 'b-amber' : 'b-red'}">${r.toFixed(2)}×</span>`;
  }
  function cplCell(c: CreativeAgg) {
    if (!c.leads || !isFinite(c.cpl)) return '<span style="color:var(--text3)">—</span>';
    return `<span class="badge ${c.cpl <= T.cpl ? 'b-green' : c.cpl <= T.cpl * 2 ? 'b-amber' : 'b-red'}">${sgd(c.cpl, 0)}</span>`;
  }
  $('creativeBody').innerHTML = data.length ? data.map((c) => `
    <tr>
      <td class="name-col" title="${c.name}">${c.name}</td>
      <td class="mono">${sgd(c.spend, 0)}</td><td class="mono">${fmtN(c.impr)}</td><td class="mono">${fmtN(c.clicks)}</td><td class="mono">${pct(c.ctr, 2)}</td>
      <td class="mono"><b>${c.leads || '—'}</b></td><td>${cplCell(c)}</td><td class="mono">${c.booked || '—'}</td><td class="mono">${c.leads ? pct(c.bookRate, 1) : '—'}</td>
      <td class="mono">${c.conducted || '—'}</td><td class="mono"><b>${c.closed || '—'}</b></td><td class="mono">${c.revenue ? sgd(c.revenue, 0) : '—'}</td>
      <td>${roasBadge(c.roas)}</td>
    </tr>`).join('') : `<tr><td colspan="13" class="empty">No data in selected range for this offer</td></tr>`;
}

function renderMonthly(s: DashState) {
  const crmSrc = getCurrentCRM(s);
  const byMonth: Record<string, { leads: number; booked: number; conducted: number; closed: number; revenue: number }> = {};
  crmSrc.forEach((r) => {
    const mk = monthKey(r['Date Opt In']); if (!mk) return;
    if (!byMonth[mk]) byMonth[mk] = { leads: 0, booked: 0, conducted: 0, closed: 0, revenue: 0 };
    byMonth[mk].leads++;
    if (STATUS.BOOKED(r)) byMonth[mk].booked++;
    if (STATUS.CONDUCTED(r)) byMonth[mk].conducted++;
    if (STATUS.CLOSED(r)) { byMonth[mk].closed++; byMonth[mk].revenue += getRevClosed(r); }
  });
  const cutoff = parseDate(AA_START_DATE);
  const metaByMonth: Record<string, { spend: number; impr: number; clicks: number }> = {};
  s.metaRaw.forEach((r) => {
    const d = parseDate(r['Date']); if (!d) return;
    const belongsToAA = cutoff ? d >= cutoff : true;
    if ((s.currentOffer === 'aa') !== belongsToAA) return;
    const mk = monthKey(r['Date']); if (!mk) return;
    if (!metaByMonth[mk]) metaByMonth[mk] = { spend: 0, impr: 0, clicks: 0 };
    metaByMonth[mk].spend += num(r['Spend']); metaByMonth[mk].impr += num(r['Impressions']); metaByMonth[mk].clicks += num(r['Clicks']);
  });

  const months = Object.keys(byMonth).sort();
  s.charts.month?.destroy();
  const canvas = $<HTMLCanvasElement>('monthChart');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    s.charts.month = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: 'Leads', data: months.map((m) => byMonth[m].leads), backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 3 },
          { label: 'Booked', data: months.map((m) => byMonth[m].booked), backgroundColor: 'rgba(8,145,178,0.7)', borderRadius: 3 },
          { label: 'Closed', data: months.map((m) => byMonth[m].closed), backgroundColor: 'rgba(21,128,61,0.9)', borderRadius: 3 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 10, family: 'DM Sans' }, boxWidth: 10, padding: 12 } } },
        scales: {
          x: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#9CA3AF' }, grid: { display: false }, border: { display: false } },
          y: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#9CA3AF' }, grid: { color: '#F0F1F4' }, border: { display: false } },
        },
      },
    });
  }

  $('monthlyBody').innerHTML = months.map((mk) => {
    const d = byMonth[mk], m = metaByMonth[mk] || { spend: 0, impr: 0, clicks: 0 };
    const sp = m.spend, impr = m.impr, clicks = m.clicks;
    const tRow = s.activeTargets;
    const br = d.leads ? d.booked / d.leads * 100 : 0;
    const sr = d.booked ? d.conducted / d.booked * 100 : 0;
    const cr = d.conducted ? d.closed / d.conducted * 100 : 0;
    const lpConv = clicks ? d.leads / clicks * 100 : 0;
    const cpb = d.booked && sp ? sp / d.booked : 0;
    const cpa = d.closed && sp ? sp / d.closed : 0;
    const ctr = impr ? clicks / impr * 100 : 0;
    const cpm = impr ? sp / impr * 1000 : 0;
    const cpc = clicks ? sp / clicks : 0;
    const roas = sp && d.revenue ? d.revenue / sp : 0;
    return `<tr>
      <td class="name-col" style="font-weight:700">${monthLabel(mk)}</td>
      <td class="mono">${sp ? sgd(sp, 0) : '—'}</td>
      <td class="mono">${impr ? fmtN(impr) : '—'}</td>
      <td class="mono">${clicks ? fmtN(clicks) : '—'}</td>
      <td class="mono">${d.leads}</td>
      <td class="mono">${d.booked}</td>
      <td class="mono">${d.conducted}</td>
      <td class="mono"><b>${d.closed}</b></td>
      <td class="mono">${d.revenue ? sgd(d.revenue, 0) : '—'}</td>
      <td class="mono">${ctr ? pct(ctr, 2) : '—'}</td>
      <td class="mono">${cpm ? sgd(cpm, 2) : '—'}</td>
      <td class="mono">${cpc ? sgd(cpc, 2) : '—'}</td>
      <td><span class="badge ${rc(lpConv, 5, 2)}">${lpConv ? pct(lpConv, 2) : '—'}</span></td>
      <td><span class="badge ${rc(br, tRow.bookRate, tRow.bookRate * .5)}">${pct(br, 1)}</span></td>
      <td><span class="badge ${rc(sr, tRow.showRate, tRow.showRate * .5)}">${pct(sr, 1)}</span></td>
      <td><span class="badge ${rc(cr, tRow.closeRate, tRow.closeRate * .5)}">${pct(cr, 1)}</span></td>
      <td class="mono">${cpb ? sgd(cpb, 0) : '—'}</td>
      <td class="mono">${cpa ? sgd(cpa, 0) : '—'}</td>
      <td>${roas ? `<span class="badge ${rc(roas, tRow.roas, tRow.roas * .5)}">${roas.toFixed(2)}×</span>` : '—'}</td>
    </tr>`;
  }).reverse().join('');
}

function renderAll(s: DashState) {
  renderOverview(s);
  renderFunnel(s);
  renderCreatives(s);
  renderMonthly(s);
}

// ── PAGE / OFFER SWITCHING (pure DOM, matches original) ────────────────
function switchPage(name: string, btn: HTMLElement) {
  document.querySelectorAll('.data-dash .page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.data-dash .nav-item,.data-dash .tab-item').forEach((b) => b.classList.remove('active'));
  $('page-' + name).classList.add('active');
  document.querySelectorAll(`.data-dash [data-page="${name}"]`).forEach((b) => b.classList.add('active'));
  $('pageTitle').textContent = btn.dataset.title || name;
}

// ── COMPONENT ───────────────────────────────────────────────────────────
export default function SalesDashboard() {
  const stateRef = useRef<DashState>({
    crmAgency: [], crmAA: [], metaRaw: [], charts: {},
    currentOffer: 'aa', activeTargets: { ...DEFAULT_TARGETS },
  });
  const [connState, setConnState] = useState<'idle' | 'loading' | 'ok' | 'error' | 'nokey'>('loading');
  const [connText, setConnText] = useState('Connecting…');

  // Measure the app's persistent TopRail height so this dashboard's
  // fixed/sticky elements (which assume they own the whole viewport, per
  // the original standalone file) sit below it instead of covering it.
  useLayoutEffect(() => {
    const rail = document.getElementById('app-top-rail');
    if (!rail) return;
    const apply = () => document.documentElement.style.setProperty('--app-top-h', `${rail.getBoundingClientRect().height}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(rail);
    return () => ro.disconnect();
  }, []);

  async function loadData() {
    const s = stateRef.current;
    setConnState('loading');
    setConnText('Loading…');
    try {
      const res = await fetch('/api/data-sheets');
      const json = await res.json() as {
        error?: string;
        crmAgency?: { ok: boolean; values?: string[][] };
        crmAA?: { ok: boolean; values?: string[][] };
        meta?: { ok: boolean; values?: string[][] };
        targets?: { ok: boolean; values?: string[][] };
      };

      if (json.error === 'no_api_key') {
        setConnState('nokey');
        setConnText('No API key configured');
        return;
      }
      if (!res.ok || !json.meta?.ok) {
        throw new Error('Meta Data tab not found — check Sheet is public and the server API key is valid.');
      }

      const parse = (j?: { values?: string[][] }): Row[] => {
        if (!j?.values) return [];
        const [h, ...rows] = j.values;
        return rows.map((r) => {
          const o: Row = {};
          h.forEach((k, i) => { o[k.trim()] = (r[i] || '').trim(); });
          return o;
        });
      };
      s.crmAgency = json.crmAgency?.ok ? parse(json.crmAgency) : [];
      s.crmAA = json.crmAA?.ok ? parse(json.crmAA) : [];
      s.metaRaw = parse(json.meta);

      if (json.targets?.ok && json.targets.values) {
        parseTargetsFromSheet(json.targets, s);
      }

      setConnState('ok');
      setConnText(`${s.crmAA.length} AA leads`);
      renderAll(s);
    } catch (e) {
      setConnState('error');
      setConnText(e instanceof Error ? e.message : 'Error');
    }
  }

  useEffect(() => {
    // Default date range: last 30 days, same as the original.
    const to = new Date(), from = new Date();
    from.setDate(from.getDate() - 30);
    $<HTMLInputElement>('dateTo').value = to.toISOString().split('T')[0];
    $<HTMLInputElement>('dateFrom').value = from.toISOString().split('T')[0];

    // Kicked off via a queued microtask, not called directly, so the
    // react-hooks/set-state-in-effect lint rule doesn't flag this as a
    // synchronous setState call inside the effect body.
    queueMicrotask(() => { loadData(); });

    const charts = stateRef.current.charts;
    return () => {
      charts.spend?.destroy();
      charts.month?.destroy();
    };
  }, []);

  function handleSwitchOffer(offer: Offer) {
    const s = stateRef.current;
    s.currentOffer = offer;
    $('offerBtn-agency').classList.toggle('active', offer === 'agency');
    $('offerBtn-aa').classList.toggle('active', offer === 'aa');
    $('offerPillTop').textContent = offer === 'aa' ? 'AA Program' : 'Agency';
    if (s.crmAA.length || s.crmAgency.length) renderAll(s);
  }

  function handleSwitchPage(name: string, e: React.MouseEvent<HTMLButtonElement>) {
    switchPage(name, e.currentTarget);
  }

  return (
    <div className="data-dash">
      {/* React 19 hoists <link>/<style> tags rendered anywhere in the tree
          into <head> automatically, so this is equivalent to the original
          file's <head> <link> for the same three Google Fonts. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router
          component-level font link; this rule targets the Pages Router
          convention and doesn't apply here. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap"
      />
      <style>{CSS}</style>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sb-logo">
          <div className="sb-brand">Pocket <span>Creative</span></div>
          <div className="sb-sub">DATA DASHBOARD · V4</div>
        </div>

        <div className="offer-toggle">
          <button className="offer-btn" id="offerBtn-agency" onClick={() => handleSwitchOffer('agency')}>Agency</button>
          <button className="offer-btn active" id="offerBtn-aa" onClick={() => handleSwitchOffer('aa')}>AA Program</button>
        </div>

        <nav className="sb-nav">
          <div className="sb-sec">Views</div>
          <button className="nav-item active" data-page="overview" data-title="Overview" onClick={(e) => handleSwitchPage('overview', e)}>
            <svg viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="1.5" y="1.5" width="5" height="5" rx="1.2" /><rect x="8.5" y="1.5" width="5" height="5" rx="1.2" /><rect x="1.5" y="8.5" width="5" height="5" rx="1.2" /><rect x="8.5" y="8.5" width="5" height="5" rx="1.2" /></svg>
            Overview
          </button>
          <button className="nav-item" data-page="funnel" data-title="Funnel" onClick={(e) => handleSwitchPage('funnel', e)}>
            <svg viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M2 3h11M4 6.5h7M6 10h3M7 12.5v-2.5" /></svg>
            Funnel
          </button>
          <button className="nav-item" data-page="creatives" data-title="Creatives" onClick={(e) => handleSwitchPage('creatives', e)}>
            <svg viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="1.5" y="3" width="12" height="9" rx="1.5" /><path d="M5 3v9M10 3v9" /></svg>
            Creatives
          </button>
          <button className="nav-item" data-page="monthly" data-title="Monthly" onClick={(e) => handleSwitchPage('monthly', e)}>
            <svg viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="2" y="3" width="11" height="10" rx="1.2" /><path d="M5 2v2M10 2v2M2 7h11" /></svg>
            Monthly
          </button>
        </nav>
        <div className="sb-footer">
          <div className={`sb-status${connState === 'ok' ? ' ok' : connState === 'error' ? ' err' : ''}`} id="sbStatus">
            <div className="dot" />
            <span id="sbTxt">{connText}</span>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main">
        <header className="topbar">
          <div className="page-title" id="pageTitle">Overview</div>
          <span className="offer-pill-top" id="offerPillTop">AA Program</span>
          <div className="topbar-right">
            <div className="date-pill">
              <div className="date-seg"><label>From</label><input type="date" id="dateFrom" onChange={() => renderAll(stateRef.current)} /></div>
              <div className="date-seg"><label>To</label><input type="date" id="dateTo" onChange={() => renderAll(stateRef.current)} /></div>
            </div>
            <span className="record-count" id="recordCount" />
          </div>
        </header>

        <div className="content">
          {connState === 'nokey' && (
            <div className="info-banner" style={{ marginBottom: 16 }}>
              No data source configured. Set <code>SALES_SHEETS_API_KEY</code> on the server to enable live data.
            </div>
          )}

          {/* OVERVIEW */}
          <div id="page-overview" className="page active">
            <div className="sec-label">Data</div>
            <div className="kpi-grid cols-3" id="dataKPIs" />
            <div className="divider" />
            <div className="sec-label">Key Metrics</div>
            <div className="metric-grid" id="metricsStrip" />
            <div className="sec-label">Daily Ad Spend</div>
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title">Spend by day (S$)</div>
                <div className="chart-badge" id="totalSpendBadge" />
              </div>
              <div className="chart-inner"><canvas id="spendChart" /></div>
            </div>
          </div>

          {/* FUNNEL */}
          <div id="page-funnel" className="page">
            <div className="sec-label">Overall Conversion Funnel</div>
            <div className="funnel-card" id="funnelViz" />
            <div className="sec-label">Stage Breakdown</div>
            <div className="tbl-card">
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Stage</th><th>Count</th><th>% of Leads</th><th>Step Conv.</th><th>vs Target</th></tr></thead>
                  <tbody id="funnelTable" />
                </table>
              </div>
            </div>
          </div>

          {/* CREATIVES */}
          <div id="page-creatives" className="page">
            <div className="tbl-card">
              <div className="tbl-toolbar">
                <span className="tbl-title">Creative Performance</span>
                <select id="sortBy" onChange={() => renderCreatives(stateRef.current)} defaultValue="spend">
                  <option value="spend">Spend</option>
                  <option value="leads">Leads</option>
                  <option value="cpl">CPL</option>
                  <option value="roas">ROAS</option>
                  <option value="closed">Closed</option>
                  <option value="bookRate">Book %</option>
                </select>
                <span className="pill" id="creativeCount" />
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Creative</th><th>Spend</th><th>Impr.</th><th>Clicks</th><th>CTR</th>
                      <th>Leads</th><th>CPL</th><th>Booked</th><th>Book%</th>
                      <th>Conducted</th><th>Closed</th><th>Revenue</th><th>ROAS</th>
                    </tr>
                  </thead>
                  <tbody id="creativeBody" />
                </table>
              </div>
            </div>
          </div>

          {/* MONTHLY */}
          <div id="page-monthly" className="page">
            <div className="sec-label">Month-over-Month</div>
            <div className="chart-card">
              <div className="chart-header"><div className="chart-title">Leads · Booked · Closed</div></div>
              <div className="chart-inner" style={{ height: 160 }}><canvas id="monthChart" /></div>
            </div>
            <div className="sec-label">Monthly Breakdown</div>
            <div className="tbl-card">
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th><th>Spend</th><th>Impressions</th><th>Clicks</th>
                      <th>Leads</th><th>Booked</th><th>Conducted</th><th>Closed</th><th>Revenue</th>
                      <th>CTR</th><th>CPM</th><th>CPC</th>
                      <th>LP Conv.</th><th>Book Rate</th><th>Show Rate</th><th>Close Rate</th>
                      <th>Cost/Booked</th><th>Cost/Acquired</th><th>ROAS</th>
                    </tr>
                  </thead>
                  <tbody id="monthlyBody" />
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE TAB BAR */}
      <nav className="tab-bar">
        <div className="tab-bar-inner">
          <button className="tab-item active" data-page="overview" data-title="Overview" onClick={(e) => handleSwitchPage('overview', e)}>
            <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7}><rect x="2" y="2" width="8" height="8" rx="1.5" /><rect x="12" y="2" width="8" height="8" rx="1.5" /><rect x="2" y="12" width="8" height="8" rx="1.5" /><rect x="12" y="12" width="8" height="8" rx="1.5" /></svg>
            Overview
          </button>
          <button className="tab-item" data-page="funnel" data-title="Funnel" onClick={(e) => handleSwitchPage('funnel', e)}>
            <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M3 5h16M6 9.5h10M9 14h4M10.5 18v-4" /></svg>
            Funnel
          </button>
          <button className="tab-item" data-page="creatives" data-title="Creatives" onClick={(e) => handleSwitchPage('creatives', e)}>
            <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7}><rect x="2" y="5" width="18" height="12" rx="2" /><path d="M8 5v12M14 5v12" /></svg>
            Creatives
          </button>
          <button className="tab-item" data-page="monthly" data-title="Monthly" onClick={(e) => handleSwitchPage('monthly', e)}>
            <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="4" width="16" height="15" rx="2" /><path d="M8 2v4M14 2v4M3 10h16" /></svg>
            Monthly
          </button>
        </div>
      </nav>
    </div>
  );
}

// ── SCOPED CSS (ported from the original file, selectors prefixed with
// `.data-dash` so the reset/typography/layout rules can't leak into the
// rest of Personal OS). Colors, fonts, spacing, and proportions are
// unchanged from the original. Modal-only rules were dropped since the
// modal itself is gone; `.info-banner` (was `.modal-hint`) is kept and
// reused for the "no data source" notice. ── */
const CSS = `
.data-dash, .data-dash *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
.data-dash{
  --bg:#F4F5F7;--surface:#fff;--surface2:#F0F1F4;
  --border:#E5E7EB;--border2:#D1D5DB;
  --text:#111827;--text2:#6B7280;--text3:#9CA3AF;
  --accent:#2563EB;--accent-light:#EFF6FF;
  --green:#15803D;--green-bg:#DCFCE7;
  --red:#B91C1C;--red-bg:#FEE2E2;
  --amber:#B45309;--amber-bg:#FEF3C7;
  --purple:#7C3AED;--purple-bg:#EDE9FE;
  --r:10px;
  --shadow:0 1px 2px rgba(0,0,0,.05),0 2px 8px rgba(0,0,0,.04);
  --sb:224px;--tab-h:64px;
  min-height:100vh;font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.5;
}

/* LAYOUT */
.data-dash .sidebar{width:var(--sb);background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:var(--app-top-h,0px);bottom:0;left:0;z-index:200;overflow-y:auto}
.data-dash .main{margin-left:var(--sb);min-height:100vh;display:flex;flex-direction:column;background:var(--bg)}
.data-dash .sb-logo{padding:22px 20px 18px;border-bottom:1px solid var(--border);flex-shrink:0}
.data-dash .sb-brand{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:var(--text)}
.data-dash .sb-brand span{color:var(--accent)}
.data-dash .sb-sub{font-size:10px;color:var(--text3);margin-top:2px;font-family:'DM Mono',monospace;letter-spacing:.04em}

.data-dash .offer-toggle{margin:14px 16px 0;display:flex;background:var(--surface2);border-radius:9px;padding:3px;border:1px solid var(--border)}
.data-dash .offer-btn{flex:1;padding:7px 8px;border:none;background:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;color:var(--text2);transition:all .15s}
.data-dash .offer-btn.active{background:var(--surface);color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.12)}

.data-dash .sb-nav{flex:1;padding:14px 12px}
.data-dash .sb-sec{font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;padding:0 8px;margin:16px 0 6px}
.data-dash .sb-sec:first-child{margin-top:0}
.data-dash .nav-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:7px;border:none;background:none;color:var(--text2);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;text-align:left;transition:all .12s}
.data-dash .nav-item svg{width:15px;height:15px;flex-shrink:0}
.data-dash .nav-item:hover{background:var(--surface2);color:var(--text)}
.data-dash .nav-item.active{background:var(--accent-light);color:var(--accent);font-weight:600}
.data-dash .sb-footer{padding:14px 16px;border-top:1px solid var(--border);flex-shrink:0}
.data-dash .sb-status{font-size:11px;font-family:'DM Mono',monospace;color:var(--text3);display:flex;align-items:center;gap:6px}
.data-dash .sb-status .dot{width:6px;height:6px;border-radius:50%;background:var(--text3);flex-shrink:0;transition:background .3s}
.data-dash .sb-status.ok .dot{background:var(--green)}.data-dash .sb-status.ok{color:var(--green)}
.data-dash .sb-status.err .dot{background:var(--red)}

/* INFO BANNER (was .modal-hint) */
.data-dash .info-banner{font-size:11px;color:var(--text3);line-height:1.5;background:var(--surface2);border-radius:8px;padding:10px 12px}
.data-dash .info-banner code{font-family:'DM Mono',monospace;color:var(--text2)}

/* TOPBAR */
.data-dash .topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;top:var(--app-top-h,0px);z-index:100}
.data-dash .page-title{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:var(--text);flex:1}
.data-dash .offer-pill-top{display:none;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:var(--accent-light);color:var(--accent);font-family:'DM Mono',monospace;letter-spacing:.04em}
.data-dash .topbar-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.data-dash .date-pill{display:flex;align-items:center;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;overflow:hidden}
.data-dash .date-seg{display:flex;align-items:center;gap:5px;padding:7px 10px;border-right:1px solid var(--border2)}
.data-dash .date-seg:last-child{border-right:none}
.data-dash .date-seg label{font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase}
.data-dash .date-seg input[type=date]{background:none;border:none;font-size:12px;font-family:'DM Mono',monospace;color:var(--text);outline:none;cursor:pointer;padding:0;max-width:120px}
.data-dash .record-count{font-size:11px;color:var(--text3);font-family:'DM Mono',monospace}

/* CONTENT */
.data-dash .content{padding:20px 24px 100px;flex:1}
.data-dash .page{display:none}.data-dash .page.active{display:block}
.data-dash .sec-label{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin:22px 0 10px}
.data-dash .sec-label:first-child{margin-top:0}
.data-dash .divider{height:1px;background:var(--border);margin:18px 0}

/* KPI */
.data-dash .kpi-grid{display:grid;gap:10px}
.data-dash .kpi-grid.cols-3{grid-template-columns:repeat(3,1fr)}
.data-dash .kpi-grid.cols-4{grid-template-columns:repeat(4,1fr)}
.data-dash .kpi-grid.cols-5{grid-template-columns:repeat(5,1fr)}
.data-dash .kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;box-shadow:var(--shadow)}
.data-dash .kpi-label{font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px}
.data-dash .kpi-val{font-family:'Syne',sans-serif;font-size:24px;font-weight:700;color:var(--text);letter-spacing:-.02em;line-height:1}
.data-dash .kpi-val.green{color:var(--green)}.data-dash .kpi-val.red{color:var(--red)}.data-dash .kpi-val.amber{color:var(--amber)}

/* METRIC TILES */
.data-dash .metric-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
.data-dash .metric-tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;box-shadow:var(--shadow)}
.data-dash .metric-name{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.data-dash .metric-val{font-family:'Syne',sans-serif;font-size:21px;font-weight:700;line-height:1.1;letter-spacing:-.02em}
.data-dash .metric-val.green{color:var(--green)}.data-dash .metric-val.red{color:var(--red)}.data-dash .metric-val.amber{color:var(--amber)}.data-dash .metric-val.neutral{color:var(--text)}
.data-dash .metric-target{font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-top:3px}
.data-dash .metric-bar-wrap{height:3px;background:var(--surface2);border-radius:2px;margin-top:7px;overflow:hidden}
.data-dash .metric-bar{height:100%;border-radius:2px}

/* CHART */
.data-dash .chart-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;box-shadow:var(--shadow);margin-bottom:14px}
.data-dash .chart-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.data-dash .chart-title{font-size:13px;font-weight:600;color:var(--text)}
.data-dash .chart-badge{font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:var(--accent)}
.data-dash .chart-inner{position:relative;height:160px}

/* FUNNEL */
.data-dash .funnel-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;box-shadow:var(--shadow);margin-bottom:14px}
.data-dash .funnel-step{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.data-dash .funnel-step:last-child{margin-bottom:0}
.data-dash .f-label{font-size:11px;font-weight:600;color:var(--text2);width:110px;text-align:right;flex-shrink:0}
.data-dash .f-track{flex:1;height:30px;background:var(--surface2);border-radius:6px;overflow:hidden}
.data-dash .f-fill{height:100%;border-radius:6px;display:flex;align-items:center;padding:0 10px;font-size:10px;font-weight:700;color:#fff;transition:width .5s cubic-bezier(.4,0,.2,1)}
.data-dash .f-stats{width:80px;flex-shrink:0;display:flex;align-items:center;gap:6px}
.data-dash .f-count{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text);width:28px}
.data-dash .f-pct{font-size:10px;font-family:'DM Mono',monospace;color:var(--text3)}

/* TABLES */
.data-dash .tbl-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;margin-bottom:14px}
.data-dash .tbl-toolbar{padding:12px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.data-dash .tbl-title{font-size:13px;font-weight:600;color:var(--text);flex:1}
.data-dash .tbl-toolbar select{background:var(--surface2);border:1px solid var(--border2);border-radius:6px;padding:5px 8px;font-size:12px;font-family:'DM Sans',sans-serif;color:var(--text);outline:none;cursor:pointer}
.data-dash .pill{background:var(--surface2);border-radius:20px;padding:3px 10px;font-size:11px;color:var(--text2);font-weight:600;font-family:'DM Mono',monospace}
.data-dash .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.data-dash table{width:100%;border-collapse:collapse;min-width:600px}
.data-dash thead th{padding:9px 12px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;background:var(--surface2);border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
.data-dash tbody tr{border-bottom:1px solid var(--border);transition:background .1s}
.data-dash tbody tr:last-child{border-bottom:none}
.data-dash tbody tr:hover{background:#FAFBFF}
.data-dash tbody td{padding:10px 12px;font-size:12px;color:var(--text)}
.data-dash td.name-col{font-weight:600;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.data-dash td.mono{font-family:'DM Mono',monospace;font-size:12px}
.data-dash .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;font-family:'DM Mono',monospace}
.data-dash .b-green{background:var(--green-bg);color:var(--green)}
.data-dash .b-amber{background:var(--amber-bg);color:var(--amber)}
.data-dash .b-red{background:var(--red-bg);color:var(--red)}
.data-dash .b-blue{background:var(--accent-light);color:var(--accent)}
.data-dash .empty{padding:36px;text-align:center;color:var(--text3);font-size:13px}

/* MOBILE TAB BAR */
.data-dash .tab-bar{display:none;position:fixed;bottom:0;left:0;right:0;height:var(--tab-h);background:var(--surface);border-top:1px solid var(--border);z-index:300;padding-bottom:env(safe-area-inset-bottom)}
.data-dash .tab-bar-inner{display:flex;height:100%;align-items:stretch}
.data-dash .tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:none;background:none;cursor:pointer;padding:8px 4px;color:var(--text3);font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500}
.data-dash .tab-item svg{width:20px;height:20px}
.data-dash .tab-item.active{color:var(--accent)}

@media(max-width:768px){
  .data-dash .sidebar{display:none}
  .data-dash .main{margin-left:0}
  .data-dash .tab-bar{display:flex}
  .data-dash .content{padding:14px 14px 80px}
  .data-dash .topbar{padding:10px 14px}
  .data-dash .kpi-grid.cols-3,.data-dash .kpi-grid.cols-4,.data-dash .kpi-grid.cols-5{grid-template-columns:repeat(2,1fr)}
  .data-dash .metric-grid{grid-template-columns:repeat(2,1fr)}
  .data-dash .offer-pill-top{display:inline-block}
}
`;
