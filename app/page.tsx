import { recentCalls, dailyMetrics, type CallRow } from '@/lib/supabase.ts';
import { env } from '@/lib/env.ts';

export const dynamic = 'force-dynamic';

const S = {
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '40px 20px 72px' } as const,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, margin: '0 0 32px' } as const,
  tile: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' } as const,
  n: { fontSize: 30, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 0' } as const,
  k: { fontSize: 12, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', margin: 0 } as const,
  card: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' } as const,
  th: { textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', padding: '12px 14px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' } as const,
  td: { padding: '12px 14px', borderBottom: '1px solid var(--line)', fontSize: 14, verticalAlign: 'top' } as const,
};

const TAG: Record<string, string> = {
  qualified: 'var(--good)', complaint: 'var(--bad)', not_fit: 'var(--muted)', unclear: 'var(--warn)',
};

function Tile({ k, v, hint }: { k: string; v: string | number; hint?: string }) {
  return (
    <div style={S.tile}>
      <p style={S.k}>{k}</p>
      <p style={S.n}>{v}</p>
      {hint ? <p style={{ ...S.k, margin: '4px 0 0', textTransform: 'none', letterSpacing: 0 }}>{hint}</p> : null}
    </div>
  );
}

function Setup({ error }: { error: string }) {
  const needed = [
    ['SUPABASE_URL', 'Supabase → Project Settings → API'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'the secret / service_role key, not the publishable one'],
    ['GEMINI_API_KEY', 'aistudio.google.com → Get API key'],
    ['GEMINI_MODEL', 'a Flash model currently open on the free tier'],
    ['VAANI_WEBHOOK_SECRET', 'any long random string — it goes in the webhook URL'],
    ['LINK_SECRET', 'another long random string, for signing email links'],
    ['RESEND_API_KEY', 'resend.com → API Keys'],
    ['EMAIL_FROM', 'Aangan Leads <onboarding@resend.dev>'],
    ['FRONT_DESK_EMAIL', 'your Resend signup email'],
    ['APP_URL', 'this deployment’s URL'],
    ['DASHBOARD_PASSWORD', 'password for this page (username: aangan)'],
    ['VAANI_RATE_INR_PER_MIN', 'your Vaani per-minute rate, e.g. 5'],
    ['CALCOM_BOOKING_URL', 'optional — your Cal.com / Calendly link'],
    ['HUBSPOT_PRIVATE_APP_TOKEN', 'optional — skipped when empty'],
  ];
  return (
    <main style={S.wrap}>
      <p style={S.k}>Aangan Studio</p>
      <h1 style={{ fontSize: 28, margin: '6px 0 10px', letterSpacing: '-0.02em' }}>Not connected yet</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 560, margin: '0 0 28px' }}>
        The app is deployed and the routes are live. It cannot reach the database yet, so there is nothing to show.
        Add these in Vercel → Settings → Environment Variables, then redeploy.
      </p>
      <div style={S.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {needed.map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...S.td, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', whiteSpace: 'nowrap' }}>{k}</td>
                <td style={{ ...S.td, color: 'var(--muted)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ ...S.k, textTransform: 'none', letterSpacing: 0, marginTop: 18 }}>
        Reported: {error}
      </p>
    </main>
  );
}

export default async function Dashboard() {
  let calls: CallRow[] = [];
  let days: Record<string, unknown>[] = [];
  try {
    [calls, days] = await Promise.all([recentCalls(50), dailyMetrics()]);
  } catch (err) {
    return <Setup error={err instanceof Error ? err.message : String(err)} />;
  }

  const n = (p: (c: CallRow) => boolean) => calls.filter(p).length;
  const total = calls.length;
  const afterHours = n((c) => Boolean(c.after_hours));
  const qualified = n((c) => c.classification === 'qualified');
  const booked = n((c) => Boolean(c.booked_slot));
  const showed = n((c) => c.showed_up === true);
  const won = n((c) => c.project_won === true);
  const cost = calls.reduce(
    (s, c) => s + Number(c.cost_voice_inr ?? 0) + Number(c.cost_llm_inr ?? 0), 0,
  );
  const wonValue = calls.reduce((s, c) => s + (c.project_won ? Number(c.project_value_inr ?? 0) : 0), 0);
  const redactions = calls.reduce((s, c) => {
    const r = (c.collected as { price_redactions?: unknown[] } | null)?.price_redactions;
    return s + (Array.isArray(r) ? r.length : 0);
  }, 0);

  return (
    <main style={S.wrap}>
      <p style={S.k}>Aangan Studio · call agent</p>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px', letterSpacing: '-0.02em' }}>
        {total} enquir{total === 1 ? 'y' : 'ies'} answered
      </h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 28px' }}>
        Every call picked up, qualified against Nikhil&rsquo;s rubric, and booked where it fits.
        The agent has never quoted a price.
      </p>

      <div style={S.grid}>
        <Tile k="Calls" v={total} />
        <Tile k="After hours" v={afterHours} hint={total ? `${Math.round((afterHours / total) * 100)}% of all calls` : undefined} />
        <Tile k="Qualified" v={qualified} />
        <Tile k="Booked" v={booked} />
        <Tile k="Showed up" v={showed} />
        <Tile k="Won" v={won} hint={wonValue ? `₹${(wonValue / 100000).toFixed(1)}L booked value` : undefined} />
        <Tile k="Running cost" v={`₹${cost.toFixed(2)}`} hint="voice + model" />
        <Tile k="Prices blocked" v={redactions} hint="figures stripped before a human saw them" />
      </div>

      <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Calls</h2>
      <div style={{ ...S.card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={S.th}>When</th>
              <th style={S.th}>Caller</th>
              <th style={S.th}>Verdict</th>
              <th style={S.th}>Why</th>
              <th style={S.th}>Price?</th>
              <th style={S.th}>Claimed</th>
              <th style={S.th}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 ? (
              <tr><td style={{ ...S.td, color: 'var(--muted)' }} colSpan={7}>
                No calls logged yet. Make one Vaani test call, or replay a past transcript through <code>/api/eval</code>.
              </td></tr>
            ) : calls.map((c) => {
              const cls = String(c.classification ?? '—');
              return (
                <tr key={String(c.id)}>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    {c.started_at ? new Date(String(c.started_at)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    {c.after_hours ? <span style={{ color: 'var(--warn)', fontSize: 12, display: 'block' }}>after hours</span> : null}
                  </td>
                  <td style={S.td}>{String(c.caller_number ?? '—')}</td>
                  <td style={{ ...S.td, color: TAG[cls] ?? 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{cls}</td>
                  <td style={{ ...S.td, color: 'var(--muted)', maxWidth: 320 }}>{String(c.fit_reason ?? '—')}</td>
                  <td style={S.td}>{c.asked_pricing ? 'asked' : '—'}</td>
                  <td style={S.td}>{c.claimed_by ? 'yes' : c.booked_slot ? 'booked' : '—'}</td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    ₹{(Number(c.cost_voice_inr ?? 0) + Number(c.cost_llm_inr ?? 0)).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {days.length > 0 ? (
        <>
          <h2 style={{ fontSize: 18, margin: '32px 0 12px' }}>By day</h2>
          <div style={{ ...S.card, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr>
                {['Day', 'Calls', 'After hours', 'Qualified', 'Booked', 'Showed', 'Won', 'Cost'].map((h) => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={String(d.day)}>
                    <td style={S.td}>{String(d.day)}</td>
                    <td style={S.td}>{String(d.calls ?? 0)}</td>
                    <td style={S.td}>{String(d.after_hours_calls ?? 0)}</td>
                    <td style={S.td}>{String(d.qualified ?? 0)}</td>
                    <td style={S.td}>{String(d.booked ?? 0)}</td>
                    <td style={S.td}>{String(d.showed_up ?? 0)}</td>
                    <td style={S.td}>{String(d.won ?? 0)}</td>
                    <td style={S.td}>₹{Number(d.cost_inr ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <p style={{ ...S.k, textTransform: 'none', letterSpacing: 0, marginTop: 28, maxWidth: 620 }}>
        The Cut: the agent never quotes a price. Pricing is Nikhil&rsquo;s call, discussed by a
        designer at the consultation. {redactions > 0 ? `${redactions} figure${redactions === 1 ? '' : 's'} have been stripped from model output before reaching a human.` : ''}
        {env('CALCOM_BOOKING_URL') ? ' Booking link configured.' : ''}
      </p>
    </main>
  );
}
