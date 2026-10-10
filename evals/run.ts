/**
 * Replay the September phone enquiries through the classifier and score them.
 *
 *   npm run eval                     # all 20, using the local classifier
 *   npm run eval -- --only T02,T10   # just those
 *   npm run eval -- --limit 5        # first five not already cached
 *   npm run eval -- --url https://your-app.vercel.app   # go through the deployed /api/eval
 *   npm run eval -- --fresh          # ignore the cache
 *
 * Results are cached in evals/.cache so re-running costs no quota. The Gemini free
 * tier allows roughly 20 requests a day, which is exactly the size of this set.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const TRANSCRIPTS = join(HERE, 'transcripts');

type Case = {
  id: string; time?: string; expected: string;
  asked_pricing?: boolean; ambiguous?: boolean; why: string; note?: string;
};
type Got = {
  classification?: string; deciding_criterion?: string; asked_pricing?: boolean;
  price_redactions?: unknown[]; overrides?: string[]; handoff_note?: string;
  lead?: Record<string, unknown>; error?: string; usage?: { cost_inr?: number };
};

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);

const only = flag('only')?.split(',').map((s) => s.trim().toUpperCase());
const limit = Number(flag('limit') ?? '0');
const remote = flag('url')?.replace(/\/$/, '');
const fresh = has('fresh');

const { cases } = JSON.parse(readFileSync(join(HERE, 'expected.json'), 'utf8')) as { cases: Case[] };

async function classifyLocal(transcript: string, c: Case): Promise<Got> {
  const { classify } = await import('../lib/classify.ts');
  const r = await classify(transcript, { time: c.time });
  return {
    classification: r.classification, deciding_criterion: r.deciding_criterion,
    asked_pricing: r.asked_pricing, price_redactions: r.redactions,
    overrides: r.overrides, handoff_note: r.handoff_note, lead: r.lead as Record<string, unknown>,
    usage: { cost_inr: r.usage.cost_inr },
  };
}

async function classifyRemote(transcript: string, c: Case): Promise<Got> {
  const token = process.env.VAANI_WEBHOOK_SECRET;
  if (!token) throw new Error('VAANI_WEBHOOK_SECRET must be set to call the deployed /api/eval');
  const res = await fetch(`${remote}/api/eval?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: c.id, transcript, time: c.time }),
  });
  const j = (await res.json()) as Got & { ok?: boolean };
  if (!res.ok || j.ok === false) return { error: j.error ?? `HTTP ${res.status}` };
  return j;
}

function cached(id: string): Got | null {
  const p = join(CACHE, `${id}.json`);
  if (fresh || !existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as Got; } catch { return null; }
}

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

async function main() {
  mkdirSync(CACHE, { recursive: true });

  // Fail before the first transcript rather than printing the same error 20 times.
  if (!remote && !process.env.GEMINI_API_KEY) {
    console.error(
      'GEMINI_API_KEY is not set, so there is nothing to classify with.\n\n' +
        '  1. Get a key at https://aistudio.google.com → Get API key\n' +
        '  2. Put it in .env.local (gitignored) next to package.json:\n' +
        '       GEMINI_API_KEY=...\n' +
        '       GEMINI_MODEL=gemini-2.5-flash\n' +
        '  3. npm run eval -- --limit 5\n\n' +
        'Or point the harness at a deployment that already has the key:\n' +
        '  npm run eval -- --url https://your-app.vercel.app\n' +
        '  (that route also needs VAANI_WEBHOOK_SECRET set locally)',
    );
    process.exit(1);
  }
  if (remote && !process.env.VAANI_WEBHOOK_SECRET) {
    console.error('--url needs VAANI_WEBHOOK_SECRET set locally to authenticate against /api/eval.');
    process.exit(1);
  }

  const missing = cases.filter((c) => !existsSync(join(TRANSCRIPTS, `${c.id}.txt`)));
  if (missing.length) {
    console.error(`Missing transcripts: ${missing.map((m) => m.id).join(', ')}`);
    console.error(`Expected them in ${TRANSCRIPTS}`);
    process.exit(1);
  }

  let selected = only ? cases.filter((c) => only.includes(c.id)) : cases;
  if (limit > 0) {
    const need = selected.filter((c) => !cached(c.id));
    selected = need.slice(0, limit);
    if (selected.length === 0) {
      console.log('Everything requested is already cached. Use --fresh to re-run.');
      selected = only ? cases.filter((c) => only.includes(c.id)) : cases;
    }
  }

  const results: { c: Case; got: Got; fromCache: boolean }[] = [];
  let calls = 0;

  for (const c of selected) {
    const hit = cached(c.id);
    if (hit) { results.push({ c, got: hit, fromCache: true }); continue; }

    const transcript = readFileSync(join(TRANSCRIPTS, `${c.id}.txt`), 'utf8');
    process.stderr.write(`  ${c.id} … `);
    let got: Got;
    try {
      got = remote ? await classifyRemote(transcript, c) : await classifyLocal(transcript, c);
    } catch (err) {
      got = { error: err instanceof Error ? err.message : String(err) };
    }
    if (!got.error) {
      calls++; // only successful requests cost quota
      writeFileSync(join(CACHE, `${c.id}.json`), JSON.stringify(got, null, 2));
    }
    process.stderr.write(got.error ? 'failed\n' : `${got.classification}\n`);
    results.push({ c, got, fromCache: false });

    if (got.error?.includes('rate limit') || got.error?.includes('429')) {
      console.error('\nStopped: Gemini daily quota reached. Cached results are kept; re-run tomorrow to finish.');
      break;
    }
    await new Promise((r) => setTimeout(r, 1200)); // be gentle with the free tier
  }

  // ---- table ----
  const head = `${pad('CALL', 6)}${pad('EXPECTED', 11)}${pad('GOT', 11)}  ${pad('OK', 4)}${pad('PRICE?', 8)}${pad('CUT', 5)}DECIDING CRITERION`;
  console.log(`\n${head}\n${'-'.repeat(head.length)}`);

  let pass = 0, scored = 0, failedRun = 0, redactions = 0, cost = 0;
  const wrong: typeof results = [];

  for (const { c, got } of results) {
    if (got.error) {
      failedRun++;
      const oneLine = got.error.replace(/\s+/g, ' ').trim();
      console.log(`${pad(c.id, 6)}${pad(c.expected, 11)}${pad('ERROR', 11)}  ${pad('—', 4)}${pad('—', 8)}${pad('—', 5)}${oneLine.slice(0, 64)}`);
      continue;
    }
    scored++;
    const ok = got.classification === c.expected;
    if (ok) pass++; else wrong.push({ c, got, fromCache: false });
    redactions += (got.price_redactions ?? []).length;
    cost += got.usage?.cost_inr ?? 0;

    const priceCol = got.asked_pricing ? 'asked' : '—';
    const priceFlag = c.asked_pricing !== undefined && c.asked_pricing !== got.asked_pricing ? '!' : '';
    console.log(
      `${pad(c.id, 6)}${pad(c.expected, 11)}${pad(String(got.classification), 11)}  ` +
      `${pad(ok ? 'yes' : 'NO', 4)}${pad(priceCol + priceFlag, 8)}` +
      `${pad(String((got.price_redactions ?? []).length || '—'), 5)}` +
      `${String(got.deciding_criterion ?? '').slice(0, 44)}`,
    );
  }

  console.log(`\n${pass}/${scored} correct${failedRun ? ` · ${failedRun} could not be run` : ''}`);
  if (redactions > 0) console.log(`${redactions} price figure(s) stripped by the filter before any human saw them.`);
  const fromCache = results.filter((r) => r.fromCache).length;
  console.log(`Model cost this run: ₹${cost.toFixed(4)} · ${calls} live request(s), ${fromCache} from cache.`);

  // The Cut holds if no price survives in the studio's own voice. A figure the caller
  // volunteered is allowed, so this re-runs the filter rather than grepping for "lakh":
  // anything it would still redact is a leak the filter failed to catch.
  const { filterText } = await import('../lib/price-filter.ts');
  const leaks: string[] = [];
  for (const { c, got } of results) {
    for (const [field, text] of [
      ['handoff_note', got.handoff_note], ['deciding_criterion', got.deciding_criterion],
    ] as const) {
      if (!text) continue;
      if (filterText(field, text).redactions.length > 0) leaks.push(`${c.id}:${field}`);
    }
  }
  console.log(
    scored === 0
      ? 'THE CUT: not assessed — nothing was classified'
      : leaks.length
        ? `THE CUT: FAILED — unattributed price survived in ${leaks.join(', ')}`
        : 'THE CUT: held — no price in the studio’s voice in any output',
  );

  if (wrong.length) {
    console.log('\nMisses:');
    for (const { c, got } of wrong) {
      console.log(`  ${c.id}  expected ${c.expected}, got ${got.classification}${c.ambiguous ? '  (flagged ambiguous)' : ''}`);
      console.log(`        expected because: ${c.why}`);
      console.log(`        model said:       ${got.deciding_criterion}`);
    }
  }

  const stale = readdirSync(CACHE).length;
  if (stale > 0 && !fresh) console.log(`\n(${stale} cached result(s) in evals/.cache — delete it or pass --fresh to re-run.)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
