import { env } from './env.ts';
import type { ClassificationResult } from './classify.ts';

/** Optional. No token means this is skipped, and a HubSpot failure must never
 *  stop the designer email — so everything here returns null instead of throwing. */

const BASE = 'https://api.hubapi.com';

async function hs<T>(path: string, body: unknown): Promise<T | null> {
  const token = env('HUBSPOT_PRIVATE_APP_TOKEN');
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[hubspot] ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error('[hubspot] request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function createDeal(opts: {
  result: ClassificationResult;
  callerNumber: string | null;
  bookedSlot: string | null;
}): Promise<string | null> {
  if (!env('HUBSPOT_PRIVATE_APP_TOKEN')) return null;
  const lead = opts.result.lead ?? {};

  const contact = await hs<{ id: string }>('/crm/v3/objects/contacts', {
    properties: {
      firstname: lead.name ?? 'Unknown caller',
      phone: lead.phone ?? opts.callerNumber ?? '',
      city: lead.locality ?? '',
      hs_lead_status: 'NEW',
    },
  });

  const dealName =
    [lead.name, lead.property_type, lead.locality].filter(Boolean).join(' · ') || 'Aangan enquiry';

  // No amount is ever set. The studio has not quoted anything.
  const deal = await hs<{ id: string }>('/crm/v3/objects/deals', {
    properties: {
      dealname: dealName,
      dealstage: env('HUBSPOT_DEAL_STAGE') ?? 'appointmentscheduled',
      pipeline: env('HUBSPOT_PIPELINE') ?? 'default',
      description: [
        opts.result.handoff_note,
        '',
        `Deciding criterion: ${opts.result.deciding_criterion}`,
        opts.bookedSlot ? `Consultation: ${opts.bookedSlot}` : '',
        lead.volunteered_budget ? `Budget volunteered by caller: ${lead.volunteered_budget}` : '',
      ].filter(Boolean).join('\n'),
    },
    ...(contact?.id
      ? { associations: [{ to: { id: contact.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }] }
      : {}),
  });

  return deal?.id ?? null;
}
