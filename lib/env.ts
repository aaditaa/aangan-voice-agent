/** Read-at-use environment access. Nothing throws at import time, so a missing
 *  optional key never breaks the build — only the feature that needs it. */

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function required(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export function num(name: string, fallback = 0): number {
  const v = env(name);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const appUrl = () => env('APP_URL')?.replace(/\/$/, '') ?? 'http://localhost:3000';
