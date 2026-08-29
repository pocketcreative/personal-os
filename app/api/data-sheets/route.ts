import { NextResponse } from 'next/server';

/**
 * Server-side proxy for the ad/sales performance dashboard (/data page).
 * Keeps the Google Sheets API key out of the browser entirely: the key
 * lives in the plain (non-NEXT_PUBLIC_) SALES_SHEETS_API_KEY env var, read
 * only here, and this route fetches all four tabs on the server before
 * handing the combined JSON to the client. Sits behind the same
 * session-cookie auth as every other /api/* route (see middleware.ts) —
 * the browser's same-origin fetch from the /data page carries that cookie
 * automatically.
 */

const SHEET_ID = '16MoRRWBuzn05lIqGHCCTBYYS85PgJPMFKW4N77JI-O8';
const TABS = ['CRM Data', 'CRM Data (AA)', 'Meta Data', 'Targets'] as const;

interface TabResult {
  ok: boolean;
  values?: string[][];
}

async function fetchTab(name: string, apiKey: string): Promise<TabResult> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`;
  try {
    const res = await fetch(`${base}/${encodeURIComponent(name)}?key=${apiKey}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { values?: string[][] };
    return { ok: true, values: json.values };
  } catch {
    return { ok: false };
  }
}

export async function GET() {
  const apiKey = process.env.SALES_SHEETS_API_KEY;
  if (!apiKey) {
    // Not configured yet — the client treats this as "no data source
    // configured" rather than an error.
    return NextResponse.json({ error: 'no_api_key' }, { headers: { 'cache-control': 'no-store' } });
  }

  const [crmAgency, crmAA, meta, targets] = await Promise.all(TABS.map((t) => fetchTab(t, apiKey)));

  return NextResponse.json(
    { crmAgency, crmAA, meta, targets },
    { headers: { 'cache-control': 'no-store' } },
  );
}
