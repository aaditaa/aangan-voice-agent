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

/** Vaani sends call_duration in milliseconds, and sometimes not at all. */
export function durationSeconds(
  callDurationMs: unknown, startedAt: Date | null, endedAt: Date | null,
): number {
  const ms = typeof callDurationMs === 'number' ? callDurationMs
    : typeof callDurationMs === 'string' ? Number(callDurationMs) : NaN;
  if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 1000);
  if (startedAt && endedAt) {
    const s = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    if (s > 0) return s;
  }
  return 0;
}
