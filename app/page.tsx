import { recentCalls, type CallRow } from '@/lib/supabase.ts';
import { env } from '@/lib/env.ts';

export const dynamic = 'force-dynamic';

const IST = 'Asia/Kolkata';
const OPEN = 10;
const CLOSE = 19;

type Verdict = 'qualified' | 'not_fit' | 'complaint' | 'unclear';

const VERDICT: Record<Verdict, { label: string; fg: string; bg: string }> = {
  qualified: { label: 'qualified', fg: 'var(--good)', bg: 'var(--good-soft)' },
  not_fit: { label: 'not a fit', fg: 'var(--muted)', bg: 'var(--line-2)' },
  complaint: { label: 'complaint', fg: 'var(--bad)', bg: 'var(--bad-soft)' },
  unclear: { label: 'unclear', fg: 'var(--warn)', bg: 'var(--warn-soft)' },
};

const istHour = (iso: unknown): number | null => {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', hour12: false })
    .format(d);
  const n = Number(h === '24' ? '0' : h);
  return Number.isFinite(n) ? n : null;
};

const istWhen = (iso: unknown): string =>
  iso
    ? new Date(String(iso)).toLocaleString('en-IN', {
        timeZone: IST, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';

type Lead = Partial<Record<'name' | 'locality' | 'property_type' | 'scope' | 'timeline', string | null>>;
const lead = (c: CallRow): Lead =>
  (c.collected as { lead?: Lead } | null)?.lead ?? {};
const redactions = (c: CallRow) => {
  const r = (c.collected as { price_redactions?: unknown[] } | null)?.price_redactions;
  return Array.isArray(r) ? r.length : 0;
};

/* ------------------------------------------------------------------ charts */

/** Calls by hour of day. One series, so no legend — the title names it. The
 *  staffed window is a background band, not a second colour, because open/closed
 *  is a region of the axis rather than a category of call. */
function HourChart({ calls }: { calls: CallRow[] }) {
  const buckets = Array.from({ length: 24 }, () => 0);
  let unknown = 0;
  for (const c of calls) {
    const h = istHour(c.started_at);
    if (h === null) unknown++;
    else buckets[h] = (buckets[h] ?? 0) + 1;
  }
  const max = Math.max(1, ...buckets);
  const W = 760, H = 210, L = 34, R = 10, T = 14, B = 34;
  const pw = W - L - R, ph = H - T - B;
  const bw = pw / 24;
  const ticks = max <= 4 ? [0, max] : [0, Math.round(max / 2), max];
  const afterHours = buckets.reduce((s, n, h) => s + (h < OPEN || h >= CLOSE ? n : 0), 0);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
           aria-label={`Calls by hour of day. ${afterHours} of ${calls.length} arrived outside the staffed window of 10am to 7pm.`}>
        <rect x={L + bw * OPEN} y={T} width={bw * (CLOSE - OPEN)} height={ph}
              fill="var(--band)" rx="6" />
        {ticks.map((t) => {
          const y = T + ph - (t / max) * ph;
          return (
            <g key={t}>
              <line x1={L} y1={y} x2={W - R} y2={y} stroke="var(--grid)" strokeWidth="1" />
              <text x={L - 7} y={y + 3.5} fontSize="10.5" fill="var(--faint)" textAnchor="end"
                    className="num">{t}</text>
            </g>
          );
        })}
        {buckets.map((n, h) => {
          if (n === 0) return null;
          const bh = Math.max(3, (n / max) * ph);
          const out = h < OPEN || h >= CLOSE;
          return (
            <g key={h}>
              <rect x={L + h * bw + 2} y={T + ph - bh} width={bw - 4} height={bh}
                    rx="3" fill={out ? 'var(--s1)' : 'var(--s2)'} />
              {out ? (
                <text x={L + h * bw + bw / 2} y={T + ph - bh - 6} fontSize="10.5"
                      fill="var(--ink-2)" textAnchor="middle" fontWeight="600" className="num">{n}</text>
              ) : null}
            </g>
          );
        })}
        <line x1={L} y1={T + ph} x2={W - R} y2={T + ph} stroke="var(--line)" strokeWidth="1" />
        {[0, 4, 8, 12, 16, 20, 23].map((h) => (
          <text key={h} x={L + h * bw + bw / 2} y={H - 13} fontSize="10.5"
                fill="var(--faint)" textAnchor="middle" className="num">
            {h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
          </text>
        ))}
      </svg>
      <div className="legend">
        <i><b style={{ background: 'var(--s2)' }} />inside office hours</i>
        <i><b style={{ background: 'var(--s1)' }} />after hours — nobody was there</i>
        <i><b style={{ background: 'var(--band)', border: '1px solid var(--line)' }} />
          10am–7pm, front desk staffed</i>
      </div>
      <figcaption>
        {afterHours} of {calls.length} calls came in outside 10am–7pm IST
        {unknown ? ` · ${unknown} with no timestamp` : ''}. Those are the ones that used to go
        unanswered.
      </figcaption>
    </figure>
  );
}

/** Verdict mix. Status colours, each with its own written label, so identity is
 *  never carried by colour alone. */
function VerdictBars({ counts, total }: { counts: Record<Verdict, number>; total: number }) {
  const order: Verdict[] = ['qualified', 'not_fit', 'complaint', 'unclear'];
  return (
    <figure>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 4 }}>
        {order.map((k) => {
          const n = counts[k];
          const pct = total ? (n / total) * 100 : 0;
          return (
            <div key={k}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{VERDICT[k].label}</span>
                <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                  {n}
                  <span style={{ color: 'var(--faint)', fontWeight: 400 }}>
                    {' '}· {pct.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div className="bar" style={{ height: 8 }}>
                <i style={{ width: `${Math.max(pct, n ? 2 : 0)}%`, background: VERDICT[k].fg }} />
              </div>
            </div>
          );
        })}
      </div>
      <figcaption>Against Nikhil&rsquo;s five criteria, on {total} call{total === 1 ? '' : 's'}.</figcaption>
    </figure>
  );
}

/** A single headline percentage, so: a gauge with the number in it, not a pie. */
function Gauge({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const r = 52, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  const on = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <svg viewBox="0 0 140 140" width="118" height="118" role="img"
           aria-label={`${label}: ${pct.toFixed(0)} percent`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line-2)" strokeWidth="13" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--s1)" strokeWidth="13"
                strokeLinecap="round" strokeDasharray={`${on} ${circ - on}`}
                transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize="27" fontWeight="700"
              fill="var(--ink)" className="num">{pct.toFixed(0)}%</text>
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize="10.5" fill="var(--faint)">
          {label}
        </text>
      </svg>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------------- pieces */

function Tile({ icon, bg, fg, label, value, pct, foot }: {
  icon: string; bg: string; fg: string; label: string; value: string;
  pct?: number; foot?: string;
}) {
  return (
    <div className="card tile">
      <div className="top">
        <span className="ico" style={{ background: bg, color: fg }} aria-hidden="true">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        </span>
        <span>
          <span className="lab">{label}</span>
          <span className="val num">{value}</span>
        </span>
      </div>
      {pct !== undefined ? (
        <div className="bar"><i style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: fg }} /></div>
      ) : null}
      {foot ? <p className="foot" style={{ margin: 0 }}>{foot}</p> : null}
    </div>
  );
}

const ICONS = {
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  coin: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
} as const;

function Setup({ error }: { error: string }) {
  const needed: [string, string][] = [
    ['SUPABASE_URL', 'Supabase → Project Settings → API'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'the secret / service_role key, not the publishable one'],
    ['GEMINI_API_KEY', 'aistudio.google.com → Get API key'],
    ['VAANI_WEBHOOK_SECRET', 'any long random string — it goes in the webhook URL'],
    ['LINK_SECRET', 'another long random string, for signing email links'],
    ['RESEND_API_KEY', 'resend.com → API Keys'],
    ['FRONT_DESK_EMAIL', 'your Resend signup email'],
    ['APP_URL', 'this deployment’s URL'],
    ['DASHBOARD_PASSWORD', 'password for this page (username: aangan)'],
  ];
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '56px 20px' }}>
      <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>Not connected yet</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 24px' }}>
        The app is deployed and the routes are live, but it cannot reach the database, so there is
        nothing to show. Add these in Vercel → Settings → Environment Variables, then redeploy.
      </p>
      <div className="card">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <tbody>
            {needed.map(([k, v], i) => (
              <tr key={k} style={{ borderTop: i ? '1px solid var(--line)' : undefined }}>
                <td style={{ padding: '11px 14px', fontFamily: 'ui-monospace,Menlo,monospace', whiteSpace: 'nowrap' }}>{k}</td>
                <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 16 }}>Reported: {error}</p>
    </main>
  );
}

/* --------------------------------------------------------------------- page */

export default async function Dashboard(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const sp = await searchParams;
  const view = String(sp.v ?? 'all');
  const q = String(sp.q ?? '').trim();

  let all: CallRow[] = [];
  try {
    all = await recentCalls(200);
  } catch (err) {
    return <Setup error={err instanceof Error ? err.message : String(err)} />;
  }

  const counts: Record<Verdict, number> = { qualified: 0, not_fit: 0, complaint: 0, unclear: 0 };
  for (const c of all) {
    const k = c.classification as Verdict | null;
    if (k && k in counts) counts[k] += 1;
  }
  const afterHoursAll = all.filter((c) => c.after_hours).length;

  let calls = all;
  if (view === 'after-hours') calls = all.filter((c) => c.after_hours);
  else if (view !== 'all') calls = all.filter((c) => c.classification === view);
  if (q) {
    const needle = q.toLowerCase();
    calls = calls.filter((c) => {
      const l = lead(c);
      return [l.name, l.locality, l.scope, c.caller_number, c.fit_reason]
        .some((v) => String(v ?? '').toLowerCase().includes(needle));
    });
  }

  const total = calls.length;
  const qualified = calls.filter((c) => c.classification === 'qualified').length;
  const booked = calls.filter((c) => c.booked_slot).length;
  const afterHours = calls.filter((c) => c.after_hours).length;
  const blocked = calls.reduce((s, c) => s + redactions(c), 0);
  const askedPrice = calls.filter((c) => c.asked_pricing).length;
  const cost = calls.reduce((s, c) => s + Number(c.cost_voice_inr ?? 0) + Number(c.cost_llm_inr ?? 0), 0);
  const secs = calls.reduce((s, c) => s + Number(c.duration_sec ?? 0), 0);
  const avgMin = total ? secs / 60 / total : 0;
  const filtered = view !== 'all' || q.length > 0;

  const viewCounts: [string, string, number][] = [
    ['all', 'All enquiries', all.length],
    ['qualified', 'Qualified', counts.qualified],
    ['not_fit', 'Not a fit', counts.not_fit],
    ['complaint', 'Complaints', counts.complaint],
    ['unclear', 'Unclear', counts.unclear],
    ['after-hours', 'After hours', afterHoursAll],
  ];
  const href = (v: string) => (v === 'all' ? '/' : `/?v=${v}`);

  return (
    <div className="shell">

      {/* ------------------------------------------------ left rail */}
      <aside className="rail-l">
        <div className="card">
          <div className="brand">
            <span className="mark">A</span>
            <span>
              <b>Aangan Studio</b>
              <span>Pune · call desk</span>
            </span>
          </div>
          <p className="navlabel">Enquiries</p>
          <nav className="nav">
            {viewCounts.map(([v, label, n]) => (
              <a key={v} href={href(v)} data-on={view === v ? '1' : '0'}>
                <span className="dot" />
                {label}
                <span className="count num">{n}</span>
              </a>
            ))}
          </nav>
        </div>

        <div className="cutcard">
          <p className="k">The Cut</p>
          <p className="v">{blocked === 0 ? 'Held' : `${blocked} blocked`}</p>
          <p className="s">
            The agent never quotes a price. {askedPrice > 0
              ? `${askedPrice} caller${askedPrice === 1 ? '' : 's'} asked — none were turned away for it.`
              : 'Pricing stays with Nikhil, discussed at the consultation.'}
          </p>
        </div>
      </aside>

      {/* ------------------------------------------------ main */}
      <main>
        <header className="head">
          <div>
            <h1>Call desk</h1>
            <p>
              {filtered
                ? `Showing ${total} of ${all.length} enquiries`
                : 'Every enquiry answered, qualified against Nikhil’s rubric, booked where it fits.'}
            </p>
          </div>
          <form className="search" action="/" method="get">
            {view !== 'all' ? <input type="hidden" name="v" value={view} /> : null}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)"
                 strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input name="q" defaultValue={q} placeholder="Search name, area, scope" aria-label="Search enquiries" />
            <button type="submit">Search</button>
          </form>
        </header>

        <div className="tiles">
          <Tile icon={ICONS.phone} bg="var(--violet-soft)" fg="var(--violet)"
                label="Enquiries answered" value={String(total)}
                pct={all.length ? (total / all.length) * 100 : 0}
                foot={`${avgMin.toFixed(1)} min average`} />
          <Tile icon={ICONS.moon} bg="var(--accent-soft)" fg="var(--accent)"
                label="After hours" value={String(afterHours)}
                pct={total ? (afterHours / total) * 100 : 0}
                foot={total ? `${Math.round((afterHours / total) * 100)}% outside 10am–7pm` : 'no calls yet'} />
          <Tile icon={ICONS.check} bg="var(--good-soft)" fg="var(--good)"
                label="Qualified" value={String(qualified)}
                pct={total ? (qualified / total) * 100 : 0}
                foot={`${booked} consultation${booked === 1 ? '' : 's'} booked`} />
          <Tile icon={ICONS.coin} bg="var(--warn-soft)" fg="var(--warn)"
                label="Running cost" value={`₹${cost.toFixed(0)}`}
                foot="voice + model, this view" />
        </div>

        <div className="grid2">
          <section className="card pad">
            <div className="ctitle">
              <h2>When people actually call</h2>
              <span>by hour, IST</span>
            </div>
            <HourChart calls={calls} />
          </section>

          <section className="card pad">
            <div className="ctitle"><h2>What the agent decided</h2></div>
            <VerdictBars
              counts={{
                qualified: calls.filter((c) => c.classification === 'qualified').length,
                not_fit: calls.filter((c) => c.classification === 'not_fit').length,
                complaint: calls.filter((c) => c.classification === 'complaint').length,
                unclear: calls.filter((c) => c.classification === 'unclear').length,
              }}
              total={total}
            />
          </section>
        </div>

        <section className="card pad">
          <div className="ctitle" style={{ marginBottom: 12 }}>
            <h2>Latest enquiries</h2>
            <span>{filtered ? `${total} matching` : `${all.length} this month`}</span>
          </div>
          {calls.length === 0 ? (
            <p className="empty">
              {filtered
                ? 'Nothing matches that filter.'
                : <>No calls logged yet. Make a Vaani test call, or replay a transcript through <code>/api/eval</code>.</>}
            </p>
          ) : (
            <div className="rows">
              {calls.slice(0, 12).map((c) => {
                const l = lead(c);
                const k = (c.classification as Verdict) ?? 'unclear';
                const v = VERDICT[k] ?? VERDICT.unclear;
                const name = String(l.name || c.caller_number || 'Unknown caller');
                const detail =
                  [l.locality, l.property_type, l.scope].filter(Boolean).join(' · ') ||
                  String(c.fit_reason ?? '') || '—';
                return (
                  <div className="row" key={String(c.id)}>
                    <span className="av" style={{ background: v.fg }} aria-hidden="true">
                      {String(name).trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="who">
                      <b>{name}</b>
                      <span>{detail}</span>
                    </span>
                    {c.asked_pricing ? (
                      <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                        asked price
                      </span>
                    ) : null}
                    <span className="chip" style={{ background: v.bg, color: v.fg }}>{v.label}</span>
                    <span className="when num">{istWhen(c.started_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="note">
          The Cut: the agent never quotes a price — that is Nikhil&rsquo;s call, discussed by a
          designer at the consultation. Asking about price never disqualifies anyone.
        </footer>
      </main>

      {/* ------------------------------------------------ right rail */}
      <aside className="rail-r">
        <div className="card pad">
          <div className="ctitle" style={{ marginBottom: 14 }}><h2>This month</h2></div>
          <div className="mini">
            <div><b className="num">{all.length}</b><span>calls</span></div>
            <div><b className="num">{counts.qualified}</b><span>qualified</span></div>
            <div><b className="num">{afterHoursAll}</b><span>after hrs</span></div>
          </div>
        </div>

        <div className="card pad">
          <div className="ctitle" style={{ marginBottom: 10 }}><h2>Qualified rate</h2></div>
          <Gauge
            pct={all.length ? (counts.qualified / all.length) * 100 : 0}
            label="of enquiries"
            sub={`${counts.qualified} of ${all.length} passed all five criteria. ${counts.complaint} went straight to a human.`}
          />
        </div>

        <div className="card pad">
          <div className="ctitle" style={{ marginBottom: 12 }}><h2>Elsewhere</h2></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <a className="linkrow" href="https://github.com/aaditaa/aangan-voice-agent">
              Source code<span className="arrow">›</span>
            </a>
            <a className="linkrow" href="/docs/component-map.html">
              Component map<span className="arrow">›</span>
            </a>
            {env('CALCOM_BOOKING_URL') ? (
              <a className="linkrow" href={env('CALCOM_BOOKING_URL')!}>
                Booking link<span className="arrow">›</span>
              </a>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
