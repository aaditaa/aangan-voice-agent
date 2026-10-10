import { timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

/** Vaani's webhooks are unsigned, so the shared secret travels in the URL.
 *  A missing secret and a wrong secret are different faults and answer differently:
 *  503 is our problem, 401 is the caller's. Neither leaks a stack trace. */
export type TokenCheck = 'ok' | 'unconfigured' | 'bad';

export function checkToken(req: Request): TokenCheck {
  const expected = env('VAANI_WEBHOOK_SECRET');
  if (!expected) return 'unconfigured';
  let given = '';
  try {
    given = new URL(req.url).searchParams.get('token') ?? '';
  } catch {
    return 'bad';
  }
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return 'bad';
  return timingSafeEqual(a, b) ? 'ok' : 'bad';
}

/** Returns a Response to send back, or null when the request is authorised. */
export function tokenGate(req: Request): Response | null {
  switch (checkToken(req)) {
    case 'ok':
      return null;
    case 'unconfigured':
      return Response.json(
        { ok: false, error: 'VAANI_WEBHOOK_SECRET is not configured on this deployment' },
        { status: 503 },
      );
    case 'bad':
      return Response.json({ ok: false, error: 'bad token' }, { status: 401 });
  }
}
