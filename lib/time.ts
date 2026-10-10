/** Aangan's front desk is staffed 10:00–19:00 IST. Everything else is the problem
 *  the agent exists to solve, so "after hours" is a first-class field. */

const OFFICE_OPEN_HOUR = 10;
const OFFICE_CLOSE_HOUR = 19;
const IST = 'Asia/Kolkata';

export function istParts(d: Date): { hour: number; minute: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;
  const hour = Number(p.hour === '24' ? '0' : p.hour);
  return { hour, minute: Number(p.minute), ymd: `${p.year}-${p.month}-${p.day}` };
}

export function isAfterHours(d: Date): boolean {
  const { hour } = istParts(d);
  return hour < OFFICE_OPEN_HOUR || hour >= OFFICE_CLOSE_HOUR;
}

/**
 * How long the call lasted, in seconds.
 *
 * `call_duration` has no reliable unit: the class guide says milliseconds, the
 * webhook sends seconds (a 208-second call arrived as 208, which divided by 1000
 * rounded to zero and took the cost column with it). So the timestamps win when
 * we have them — a start and an end are unambiguous — and the reported duration
 * is only a fallback, with its unit inferred from magnitude.
 */
const MAX_PLAUSIBLE_CALL_SECONDS = 4 * 60 * 60; // past this, the number must be ms

export function durationSeconds(
  reported: unknown, startedAt: Date | null, endedAt: Date | null,
): number {
  if (startedAt && endedAt) {
    const s = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    if (s > 0) return s;
  }
  const n = typeof reported === 'number' ? reported
    : typeof reported === 'string' ? Number(reported) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > MAX_PLAUSIBLE_CALL_SECONDS ? Math.round(n / 1000) : Math.round(n);
}
