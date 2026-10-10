import { createHmac, timingSafeEqual } from 'node:crypto';
import { required, appUrl } from './env.ts';

/** Claim / Reschedule links land in a designer's inbox, where scanners click
 *  everything. So the link is signed, GET only confirms, and POST acts. */

export type Action = 'claim' | 'reschedule';

export function sign(action: Action, callId: string): string {
  return createHmac('sha256', required('LINK_SECRET'))
    .update(`${action}:${callId}`)
    .digest('base64url');
}

export function verify(action: Action, callId: string, token: string): boolean {
  const expected = Buffer.from(sign(action, callId));
  const given = Buffer.from(token ?? '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function linkFor(action: Action, callId: string): string {
  const t = sign(action, callId);
  return `${appUrl()}/api/lead/${action}?call=${encodeURIComponent(callId)}&t=${t}`;
}
