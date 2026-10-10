import { tokenGate } from '@/lib/auth.ts';
import { classify } from '@/lib/classify.ts';
import { normaliseTranscript } from '@/lib/vaani.ts';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Dry run. No database row, no email, no CRM deal — just the classifier's answer,
 *  so past transcripts can be replayed without spending anything or paging a human. */

export async function POST(req: Request): Promise<Response> {
  const denied = tokenGate(req);
  if (denied) return denied;

  let body: { id?: string; transcript?: unknown; time?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'body is not JSON' }, { status: 400 });
  }

  const transcript = normaliseTranscript(body.transcript);
  if (!transcript) {
    return Response.json({ ok: false, error: 'transcript is required' }, { status: 400 });
  }

  const started = Date.now();
  try {
    const result = await classify(transcript, { time: body.time, date: body.date });
    return Response.json({
      ok: true,
      id: body.id ?? null,
      dry_run: true,
      ms: Date.now() - started,
      classification: result.classification,
      deciding_criterion: result.deciding_criterion,
      fit_reason: result.fit_reason,
      asked_pricing: result.asked_pricing,
      segment: result.segment,
      lead: result.lead,
      notes_for_human: result.notes_for_human,
      handoff_note: result.handoff_note,
      price_redactions: result.redactions,
      overrides: result.overrides,
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, id: body.id ?? null, error: message }, { status: 502 });
  }
}
