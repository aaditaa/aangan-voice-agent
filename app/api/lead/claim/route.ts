import { verify } from '@/lib/links.ts';
import { getCallById, patchCall } from '@/lib/supabase.ts';

export const runtime = 'nodejs';

const ACTION = 'claim' as const;

/**
 * Inbox link scanners click every link they see, so GET only ever renders a
 * confirmation page. The state change happens on POST, from that page's button.
 */

const page = (title: string, body: string, form?: { callId: string; token: string }): Response =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f5f3f0;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;">
<div style="max-width:420px;margin:0 auto;padding:48px 20px;">
  <h1 style="font-size:22px;margin:0 0 12px;">${title}</h1>
  <p style="margin:0 0 22px;color:#57534e;">${body}</p>
  ${
    form
      ? `<form method="post" action="/api/lead/claim?call=${encodeURIComponent(form.callId)}&t=${encodeURIComponent(form.token)}">
  <button type="submit" style="width:100%;padding:14px 18px;background:#1c1917;color:#fff;border:0;border-radius:8px;font:600 16px system-ui;cursor:pointer;">Yes, I'm taking this lead</button>
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
  if (!c) return page('Link not valid', 'This link is expired or incorrect. Open the lead from the dashboard instead.');
  const call = await getCallById(c.callId).catch(() => null);
  if (!call) return page('Lead not found', 'This lead is no longer in the system.');
  if (call.claimed_by) {
    return page('Already claimed', `This lead was claimed on ${new Date(String(call.claimed_at)).toLocaleString('en-IN')}.`);
  }
  return page('Claim this lead?', 'Confirming tells the studio you are taking this consultation.', c);
}

export async function POST(req: Request): Promise<Response> {
  const c = checked(req);
  if (!c) return page('Link not valid', 'This link is expired or incorrect.');
  const call = await getCallById(c.callId).catch(() => null);
  if (!call) return page('Lead not found', 'This lead is no longer in the system.');
  if (call.claimed_by) return page('Already claimed', 'Someone got there first.');

  await patchCall(c.callId, {
    claimed_by: 'designer-link',
    claimed_at: new Date().toISOString(),
  });
  return page('Claimed — thank you', 'The studio can see that you are taking this one. The caller is expecting you.');
}
