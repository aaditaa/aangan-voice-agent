import { required } from './env.ts';

/** PostgREST over fetch — the server holds the service-role key, RLS stays on,
 *  and the browser never talks to the database. No client library needed. */

function base(): string {
  return required('SUPABASE_URL').replace(/\/$/, '');
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function sb<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base()}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status} on ${path}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

export type CallRow = Record<string, unknown> & { id?: string; vaani_call_id?: string };

/** call_started — upsert so a retried webhook cannot create a second row. */
export async function upsertCallStart(row: {
  vaani_call_id: string;
  caller_number: string | null;
  started_at: string;
  after_hours: boolean;
  status: string;
}): Promise<CallRow | null> {
  const out = await sb<CallRow[]>('calls?on_conflict=vaani_call_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([row]),
  });
  return out?.[0] ?? null;
}

export async function upsertCallFull(row: Record<string, unknown>): Promise<CallRow | null> {
  const out = await sb<CallRow[]>('calls?on_conflict=vaani_call_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([row]),
  });
  return out?.[0] ?? null;
}

export async function patchCall(id: string, fields: Record<string, unknown>): Promise<CallRow | null> {
  const out = await sb<CallRow[]>(`calls?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(fields),
  });
  return out?.[0] ?? null;
}

export async function getCallById(id: string): Promise<CallRow | null> {
  const out = await sb<CallRow[]>(`calls?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return out?.[0] ?? null;
}

export async function getCallByVaaniId(vaaniId: string): Promise<CallRow | null> {
  const out = await sb<CallRow[]>(
    `calls?vaani_call_id=eq.${encodeURIComponent(vaaniId)}&select=*&limit=1`,
  );
  return out?.[0] ?? null;
}

export type Designer = { id: string; name: string; email: string | null; specialties: string[] };

/** Round-robin would need state; for one studio, first active designer whose
 *  specialties cover the segment is enough, with any active designer as fallback. */
export async function pickDesigner(segment: string): Promise<Designer | null> {
  const all = await sb<Designer[]>('designers?active=eq.true&select=id,name,email,specialties');
  if (!all || all.length === 0) return null;
  return all.find((d) => (d.specialties ?? []).includes(segment)) ?? all[0] ?? null;
}

export async function recentCalls(limit = 50): Promise<CallRow[]> {
  return (
    (await sb<CallRow[]>(
      `calls?select=*&order=started_at.desc.nullslast&limit=${limit}`,
    )) ?? []
  );
}

export async function dailyMetrics(): Promise<Record<string, unknown>[]> {
  return (await sb<Record<string, unknown>[]>('daily_metrics?select=*&limit=30')) ?? [];
}
