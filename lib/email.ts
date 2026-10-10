import { env, required } from './env.ts';
import { linkFor } from './links.ts';
import { containsPrice } from './price-filter.ts';
import type { ClassificationResult } from './classify.ts';

/** Resend. Designers read these on a phone between site visits, so the email is
 *  one column, big tap targets, and the note comes before the detail table. */

async function send(to: string, subject: string, html: string): Promise<string | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${required('RESEND_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env('EMAIL_FROM') ?? 'Aangan Leads <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${text}`);
  try {
    return (JSON.parse(text) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const WRAP = (inner: string): string => `<!doctype html><html><body style="margin:0;padding:0;background:#f5f3f0;">
<div style="max-width:560px;margin:0 auto;padding:20px 16px;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;">
${inner}
<p style="margin:28px 0 0;font-size:12px;color:#78716c;border-top:1px solid #e7e5e4;padding-top:12px;">
Aangan Studio · sent by the call agent. It never quotes a price — pricing is discussed by the designer at the consultation.
</p></div></body></html>`;

const BTN = (href: string, label: string, bg: string): string =>
  `<a href="${esc(href)}" style="display:block;margin:0 0 10px;padding:14px 18px;background:${bg};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;text-align:center;">${esc(label)}</a>`;

function row(k: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return `<tr><td style="padding:7px 12px 7px 0;color:#78716c;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:7px 0;font-weight:500;">${esc(v)}</td></tr>`;
}

export async function sendDesignerLead(opts: {
  to: string;
  callId: string;
  designerName: string;
  result: ClassificationResult;
  callerNumber: string | null;
  afterHours: boolean;
  bookedSlot: string | null;
  recordingUrl: string | null;
}): Promise<string | null> {
  const { result: r } = opts;
  const lead = r.lead ?? {};

  // Defence in depth: the note was filtered at the model boundary; verify before it leaves.
  for (const [field, text] of [['fit_reason', r.fit_reason], ['handoff_note', r.handoff_note], ['notes_for_human', r.notes_for_human]] as const) {
    if (text && containsPrice(text)) {
      console.error(`[THE CUT] a price survived into ${field} for call ${opts.callId} — not sending that text`);
    }
  }

  const title = [lead.name, lead.property_type, lead.locality].filter(Boolean).join(' · ') || 'New enquiry';
  const subject = opts.bookedSlot
    ? `New lead · ${title} · consultation ${opts.bookedSlot}`
    : `New lead · ${title}`;

  const noteLines = String(r.handoff_note ?? '')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => `<li style="margin:0 0 6px;">${esc(l)}</li>`).join('');

  const html = WRAP(`
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#a8a29e;">
  Qualified lead${opts.afterHours ? ' · came in after hours' : ''}
</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">${esc(title)}</h1>

<div style="background:#fff;border:1px solid #e7e5e4;border-radius:10px;padding:16px 18px;margin:0 0 18px;">
  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#78716c;">THE HANDOFF</p>
  <ul style="margin:0;padding-left:18px;">${noteLines}</ul>
</div>

<table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 20px;">
  ${row('Caller', lead.name)}
  ${row('Phone', lead.phone ?? opts.callerNumber)}
  ${row('Where', lead.locality)}
  ${row('Property', [lead.property_type, lead.carpet_area_sqft].filter(Boolean).join(', '))}
  ${row('Scope', lead.scope)}
  ${row('Timeline', lead.timeline)}
  ${row('Decision-maker', lead.decision_maker)}
  ${row('Found us via', lead.source)}
  ${row("Caller's stated budget", lead.volunteered_budget)}
  ${row('Asked about price', r.asked_pricing ? 'Yes — deflected, not disqualifying' : 'No')}
  ${row('Consultation', opts.bookedSlot)}
  ${row('Why it qualified', `${r.deciding_criterion} — ${r.fit_reason}`)}
  ${r.notes_for_human ? row('Needs care', r.notes_for_human) : ''}
</table>

${BTN(linkFor('claim', opts.callId), 'Claim this lead', '#1c1917')}
${BTN(linkFor('reschedule', opts.callId), 'Ask to reschedule', '#78716c')}
${env('CALCOM_BOOKING_URL') ? BTN(env('CALCOM_BOOKING_URL')!, 'Open booking link', '#57534e') : ''}
${opts.recordingUrl ? `<p style="margin:14px 0 0;"><a href="${esc(opts.recordingUrl)}" style="color:#57534e;">Listen to the call</a></p>` : ''}
`);

  return send(opts.to, subject, html);
}

export async function sendComplaintToFrontDesk(opts: {
  to: string; callId: string; callerNumber: string | null; result: ClassificationResult; transcript: string;
}): Promise<string | null> {
  const html = WRAP(`
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#b91c1c;">Complaint · a human must call back</p>
<h1 style="margin:0 0 14px;font-size:22px;">${esc(opts.result.lead?.name ?? 'Existing client')} · ${esc(opts.callerNumber ?? 'number not captured')}</h1>
<div style="background:#fff;border:1px solid #e7e5e4;border-radius:10px;padding:16px 18px;margin:0 0 18px;">
  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#78716c;">WHAT WAS SAID</p>
  <ul style="margin:0;padding-left:18px;">${String(opts.result.handoff_note ?? '').split('\n').filter(Boolean).map((l) => `<li style="margin:0 0 6px;">${esc(l.trim())}</li>`).join('')}</ul>
</div>
<p style="margin:0 0 8px;color:#78716c;font-size:14px;">The agent took a message and promised a callback. It did not attempt to resolve anything.</p>
<details><summary style="cursor:pointer;color:#57534e;">Full transcript</summary><pre style="white-space:pre-wrap;font-size:13px;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:12px;">${esc(opts.transcript)}</pre></details>
`);
  return send(opts.to, `Complaint · ${opts.result.lead?.name ?? 'existing client'} · call back today`, html);
}

/** Never lose a lead: if classification failed, a human still gets the transcript. */
export async function sendRawTranscriptFallback(opts: {
  to: string; callId: string; callerNumber: string | null; transcript: string; error: string;
}): Promise<string | null> {
  const html = WRAP(`
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#b45309;">Needs a human — the classifier failed</p>
<h1 style="margin:0 0 14px;font-size:21px;">Call ${esc(opts.callId)}${opts.callerNumber ? ` · ${esc(opts.callerNumber)}` : ''}</h1>
<p style="margin:0 0 14px;">This enquiry was logged but not classified, so nobody has been emailed about it. Please read it and act.</p>
<pre style="white-space:pre-wrap;font-size:13px;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:12px;">${esc(opts.transcript || '(no transcript captured)')}</pre>
<p style="margin:14px 0 0;font-size:12px;color:#78716c;">Error: ${esc(opts.error)}</p>
`);
  return send(opts.to, `Unclassified enquiry · ${opts.callerNumber ?? opts.callId} · needs a human`, html);
}
