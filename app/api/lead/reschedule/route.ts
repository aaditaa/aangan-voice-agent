import { verify } from '@/lib/links.ts';
import { getCallById, patchCall } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

const ACTION = 'reschedule' as const;

/** Same GET-confirm / POST-act shape as claim, so a link scanner cannot move a slot. */

const page = (title: string, body: string, form?: { callId: string; token: string }): Response =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f5f3f0;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;">
<div style="max-width:420px;margin:0 auto;padding:48px 20px;">
  <h1 style="font-size:22px;margin:0 0 12px;">${title}</h1>
  <p style="margin:0 0 22px;color:#57534e;">${body}</p>
  ${
    form
      ? `<form method="post" action="/api/lead/reschedule?call=${encodeURIComponent(form.callId)}&t=${encodeURIComponent(form.token)}">
  <button type="submit" style="width:100%;padding:14px 18px;background:#78716c;color:#fff;border:0;border-radius:8px;font:600 16px system-ui;cursor:pointer;">Yes, ask the front desk to reschedule</button>
</form>`
      : ''
  }
</div></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

function checked(req: Request): { callId: string; token: string } | null {
  const u = new URL(req.url);
  const callId = u.searchParams.get('call') ?? '';
  const token = u.searchParams.get('t') ?? '';
  if (!callId || !token || !verify(ACTION, callId, token)) return null;
  return { callId, token };
}

export async function GET(req: Request): Promise<Response> {
  const c = checked(req);
  if (!c) return page('Link not valid', 'This link is expired or incorrect.');
  const call = await getCallById(c.callId).catch(() => null);
  if (!call) return page('Lead not found', 'This lead is no longer in the system.');
  return page(
    'Request a reschedule?',
    'The front desk will contact the caller to move the consultation. Nothing is cancelled automatically.',
    c,
  );
}

export async function POST(req: Request): Promise<Response> {
  const c = checked(req);
  if (!c) return page('Link not valid', 'This link is expired or incorrect.');
  await patchCall(c.callId, { reschedule_requested_at: new Date().toISOString() });
  return page('Reschedule requested', 'The front desk has been flagged. A person will call to agree a new time.');
}
