/**
 * Load the 20 real September enquiries into the dashboard.
 *
 *   npm run backfill            # write them
 *   npm run backfill -- --undo  # remove them again
 *
 * These are the case pack's own calls, classified by this agent through the eval
 * harness. Rows are tagged `sep-2026-*` so they can be removed in one command and
 * are never confused with calls the agent actually answered.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAfterHours } from '../lib/time.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const PREFIX = 'sep-2026-';

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}
const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };

const MONTHS: Record<string, string> = { september: '09', october: '10', august: '08' };

/** "2 September" + "10:23am" -> 2026-09-02T10:23:00+05:30 */
function istDate(date: string, time: string): Date | null {
  const d = date.trim().match(/^(\d{1,2})\s+([A-Za-z]+)/);
  const t = time.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)/);
  if (!d || !t) return null;
  const mm = MONTHS[d[2]!.toLowerCase()];
  if (!mm) return null;
  let h = Number(t[1]);
  if (t[3] === 'pm' && h !== 12) h += 12;
  if (t[3] === 'am' && h === 12) h = 0;
  return new Date(
    `2026-${mm}-${d[1]!.padStart(2, '0')}T${String(h).padStart(2, '0')}:${t[2]}:00+05:30`,
  );
}

/** "4 min 12 sec" -> 252 */
function seconds(note: string): number {
  const m = note.match(/(\d+)\s*min/);
  const s = note.match(/(\d+)\s*sec/);
  return (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
}

async function undo() {
  const res = await fetch(`${url}/rest/v1/calls?vaani_call_id=like.${PREFIX}*`, {
    method: 'DELETE', headers,
  });
  console.log(res.ok ? `Removed the ${PREFIX}* rows.` : `Delete failed: ${res.status} ${await res.text()}`);
}

async function main() {
  if (process.argv.includes('--undo')) return undo();

  if (!existsSync(CACHE) || readdirSync(CACHE).length === 0) {
    console.error('No cached results. Run `npm run eval` first — the backfill replays what it found.');
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(join(HERE, 'transcripts', '_meta.json'), 'utf8')) as
    Record<string, { date: string; time: string; note: string }>;
  const rate = Number(process.env.VAANI_RATE_INR_PER_MIN ?? 0);

  // one designer to attach qualified leads to, so the dashboard shows the handoff
  const dRes = await fetch(`${url}/rest/v1/designers?select=id&active=eq.true&limit=1`, { headers });
  const designerId = (await dRes.json() as { id: string }[])[0]?.id ?? null;

  type Row = {
    vaani_call_id: string; caller_number: string; status: string;
    started_at: string; ended_at: string; duration_sec: number; after_hours: boolean;
    summary: string; transcript: string[]; classification: string;
    fit_reason: string | null; asked_pricing: boolean; handoff_note: string | null;
    designer_id: string | null; cost_voice_inr: number; cost_llm_inr: number;
    collected: { source: string; lead: unknown; deciding_criterion: string | null;
                 price_redactions: unknown[]; overrides: unknown[] };
  };
  const rows: Row[] = [];
  for (const [id, m] of Object.entries(meta).sort()) {
    const cachePath = join(CACHE, `${id}.json`);
    if (!existsSync(cachePath)) { console.warn(`  skip ${id} — not in the eval cache`); continue; }
    const got = JSON.parse(readFileSync(cachePath, 'utf8'));
    const started = istDate(m.date, m.time);
    if (!started) { console.warn(`  skip ${id} — could not read "${m.date} ${m.time}"`); continue; }

    const dur = seconds(m.note);
    const transcript = readFileSync(join(HERE, 'transcripts', `${id}.txt`), 'utf8');
    const qualified = got.classification === 'qualified';

    rows.push({
      vaani_call_id: `${PREFIX}${id}`,
      caller_number: '[redacted]',           // the case pack anonymises every number
      status: 'completed',
      started_at: started.toISOString(),
      ended_at: new Date(started.getTime() + dur * 1000).toISOString(),
      duration_sec: dur,
      after_hours: isAfterHours(started),
      summary: `${id} · ${m.date}, ${m.time} · ${m.note}`,
      transcript: transcript.split('\n').filter(Boolean),
      classification: got.classification,
      fit_reason: got.fit_reason ?? got.deciding_criterion ?? null,
      asked_pricing: Boolean(got.asked_pricing),
      handoff_note: got.handoff_note ?? null,
      designer_id: qualified ? designerId : null,
      cost_voice_inr: Number(((dur / 60) * rate).toFixed(2)),
      cost_llm_inr: 0,
      collected: {
        source: 'case pack · September 2026 enquiries',
        lead: got.lead ?? {},
        deciding_criterion: got.deciding_criterion ?? null,
        price_redactions: got.price_redactions ?? [],
        overrides: got.overrides ?? [],
      },
    });
  }

  const res = await fetch(`${url}/rest/v1/calls?on_conflict=vaani_call_id`, {
    method: 'POST',
    headers: { ...headers, prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) { console.error(`Write failed: ${res.status} ${await res.text()}`); process.exit(1); }

  const written = (await res.json()) as unknown[];
  const n = (p: (r: Row) => boolean) => rows.filter(p).length;
  console.log(`\nWrote ${written.length} calls.\n`);
  console.log(`  calls           ${rows.length}`);
  console.log(`  after hours     ${n((r) => r.after_hours)}`);
  console.log(`  qualified       ${n((r) => r.classification === 'qualified')}`);
  console.log(`  not a fit       ${n((r) => r.classification === 'not_fit')}`);
  console.log(`  complaint       ${n((r) => r.classification === 'complaint')}`);
  console.log(`  unclear         ${n((r) => r.classification === 'unclear')}`);
  console.log(`  asked a price   ${n((r) => r.asked_pricing)}`);
  console.log(`  prices blocked  ${rows.reduce((s, r) => s + r.collected.price_redactions.length, 0)}`);
  console.log(`  voice cost      ₹${rows.reduce((s, r) => s + r.cost_voice_inr, 0).toFixed(2)}`);
  console.log(`\nRemove them again with: npm run backfill -- --undo`);
}

main().catch((e) => { console.error(e); process.exit(1); });
