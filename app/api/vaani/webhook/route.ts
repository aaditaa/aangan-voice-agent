import { env, num } from '@/lib/env.ts';
import { tokenGate } from '@/lib/auth.ts';
import { normalise } from '@/lib/vaani.ts';
import { isAfterHours, durationSeconds } from '@/lib/time.ts';
import { classify } from '@/lib/classify.ts';
import { upsertCallStart, upsertCallFull, patchCall, getCallByVaaniId, pickDesigner } from '@/lib/supabase.ts';
import { sendDesignerLead, sendComplaintToFrontDesk, sendRawTranscriptFallback } from '@/lib/email.ts';
import { createDeal } from '@/lib/hubspot.ts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ok = (body: Record<string, unknown>) => Response.json({ ok: true, ...body });

export async function POST(req: Request): Promise<Response> {
  const denied = tokenGate(req);
  if (denied) return denied;

  // Vaani's "Test Connectivity" button, and most providers' health probes, POST a body
  // with no call in it. Answering 4xx to a probe is how a provider decides the endpoint
  // is broken and disables the hook — so anything unrecognised gets a 200 and a log line,
  // and the diagnosis goes in the body where a human will read it.
  let payload: Record<string, any>;
  try {
    payload = await req.json();
  } catch {
    console.warn('[webhook] non-JSON body — treating as a connectivity probe');
    return ok({ stage: 'ping', note: 'Reachable and authenticated. Body was not JSON, so there was nothing to process.' });
  }

  const call = normalise(payload);
  if (!call.callId) {
    console.warn(`[webhook] no call id in payload; keys were: ${call.rawKeys.join(',') || '(none)'}`);
    return ok({
      stage: 'ping',
      note: 'Reachable and authenticated. No call id in the payload, so there was nothing to process — expected for a connectivity test.',
      event_seen: call.event,
      keys: call.rawKeys,
    });
  }

  // ---------- call_started: just open the row ----------
  if (call.event === 'call_started') {
    const startedAt = call.startedAt ?? new Date();
    await upsertCallStart({
      vaani_call_id: call.callId,
      caller_number: call.callerNumber,
      started_at: startedAt.toISOString(),
      after_hours: isAfterHours(startedAt),
      status: 'in_progress',
    });
    return ok({ stage: 'call_started', call_id: call.callId });
  }

  // ---------- call_ended: record the outcome, but do not classify ----------
  // The finished transcript only arrives with post-processing. Classifying here would
  // set `classification` and make the real event look like a retry.
  if (call.event === 'call_ended') {
    const endedAt = call.endedAt ?? new Date();
    const prior = await getCallByVaaniId(call.callId).catch(() => null);
    const startedAt = call.startedAt ?? (prior?.started_at ? new Date(String(prior.started_at)) : null);
    const duration = durationSeconds(call.durationMsRaw, startedAt, endedAt);
    await upsertCallFull({
      vaani_call_id: call.callId,
      caller_number: call.callerNumber ?? prior?.caller_number ?? null,
      status: 'ended',
      ended_at: endedAt.toISOString(),
      duration_sec: duration,
      recording_url: call.recordingUrl,
      cost_voice_inr: Number(((duration / 60) * num('VAANI_RATE_INR_PER_MIN')).toFixed(2)),
    }).catch((err) => {
      console.error('[webhook] call_ended write failed:', err instanceof Error ? err.message : err);
      return null;
    });
    return ok({ stage: 'call_ended', call_id: call.callId, awaiting: 'call_postprocessing' });
  }

  if (call.event !== 'call_postprocessing') {
    console.warn(
      `[webhook] unrecognised event "${call.event}". If Vaani's post-processing event is ` +
        `named something unexpected, nothing will ever classify. Payload keys: ${call.rawKeys.join(',')}`,
    );
    return ok({ stage: 'ignored', event_seen: call.event, keys: call.rawKeys });
  }

  // ---------- call_postprocessing ----------
  // The database is not allowed to decide whether a lead reaches a human. If it is
  // unreachable we log loudly and carry on to classify and email — losing the row is
  // recoverable, losing the enquiry is not.
  let dbUp = true;
  const existing = await getCallByVaaniId(call.callId).catch((err) => {
    dbUp = false;
    console.error('[webhook] could not read the call row:', err instanceof Error ? err.message : err);
    return null;
  });

  // Idempotent: a retried webhook must not re-classify, re-email or re-create a deal.
  if (existing?.classification) {
    return ok({ stage: 'already_processed', call_id: call.callId, classification: existing.classification });
  }

  const startedAt = call.startedAt ?? (existing?.started_at ? new Date(String(existing.started_at)) : null);
  const endedAt = call.endedAt ?? new Date();
  const duration = durationSeconds(call.durationMsRaw, startedAt, endedAt);
  const afterHours = startedAt ? isAfterHours(startedAt) : Boolean(existing?.after_hours);

  const row = await upsertCallFull({
    vaani_call_id: call.callId,
    caller_number: call.callerNumber ?? existing?.caller_number ?? null,
    status: 'completed',
    started_at: (startedAt ?? endedAt).toISOString(),
    ended_at: endedAt.toISOString(),
    duration_sec: duration,
    after_hours: afterHours,
    recording_url: call.recordingUrl,
    summary: call.summary,
    transcript: call.transcript ? call.transcript.split('\n') : [],
    collected: { entities: call.entities, raw_shape: call.rawKeys, booked_slot_raw: call.bookedSlot },
    cost_voice_inr: Number(((duration / 60) * num('VAANI_RATE_INR_PER_MIN')).toFixed(2)),
  }).catch((err) => {
    dbUp = false;
    console.error('[webhook] could not write the call row:', err instanceof Error ? err.message : err);
    return null;
  });

  const callRowId = String(row?.id ?? existing?.id ?? '');
  const frontDesk = env('FRONT_DESK_EMAIL');

  // ---------- classify ----------
  let result;
  try {
    result = await classify(call.transcript || call.summary || '');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[webhook] classification failed:', message);
    // Never lose a lead.
    if (frontDesk) {
      try {
        await sendRawTranscriptFallback({
          to: frontDesk, callId: call.callId, callerNumber: call.callerNumber,
          transcript: call.transcript, error: message,
        });
      } catch (e) {
        console.error('[webhook] fallback email also failed:', e);
      }
    }
    if (callRowId) {
      await patchCall(callRowId, {
        status: 'classification_failed',
        handoff_note: `Classifier failed: ${message}. Raw transcript emailed to the front desk.`,
      }).catch(() => null);
    }
    return ok({ stage: 'classification_failed', call_id: call.callId, escalated_to: frontDesk ?? null, db_ok: dbUp });
  }

  const bookedSlot = call.bookedSlot;

  // ---------- outputs: independent, best-effort ----------
  let designerId: string | null = null;
  let emailId: string | null = null;
  let dealId: string | null = null;

  if (result.classification === 'qualified') {
    const designer = await pickDesigner(result.segment).catch(() => null);
    designerId = designer?.id ?? null;
    const to = designer?.email ?? frontDesk;

    const [mail, deal] = await Promise.allSettled([
      to
        ? sendDesignerLead({
            to, callId: callRowId || call.callId, designerName: designer?.name ?? 'the studio',
            result, callerNumber: call.callerNumber, afterHours, bookedSlot,
            recordingUrl: call.recordingUrl,
          })
        : Promise.resolve(null),
      createDeal({ result, callerNumber: call.callerNumber, bookedSlot }),
    ]);

    if (mail.status === 'fulfilled') emailId = mail.value;
    else console.error('[webhook] designer email failed:', mail.reason);
    if (deal.status === 'fulfilled') dealId = deal.value;
    else console.error('[webhook] hubspot deal failed:', deal.reason);
  } else if (result.classification === 'complaint' && frontDesk) {
    try {
      emailId = await sendComplaintToFrontDesk({
        to: frontDesk, callId: callRowId || call.callId, callerNumber: call.callerNumber,
        result, transcript: call.transcript,
      });
    } catch (err) {
      console.error('[webhook] complaint email failed:', err);
    }
  }

  if (callRowId) {
    await patchCall(callRowId, {
      classification: result.classification,
      fit_reason: `${result.deciding_criterion} — ${result.fit_reason}`,
      asked_pricing: result.asked_pricing,
      handoff_note: result.handoff_note,
      designer_id: designerId,
      booked_slot: bookedSlot,
      hubspot_deal_id: dealId,
      email_message_id: emailId,
      cost_llm_inr: Number(result.usage.cost_inr.toFixed(4)),
      collected: {
        entities: call.entities,
        raw_shape: call.rawKeys,
        lead: result.lead,
        notes_for_human: result.notes_for_human,
        segment: result.segment,
        price_redactions: result.redactions,
        overrides: result.overrides,
        model: result.model,
      },
    }).catch((e) => console.error('[webhook] final patch failed:', e));
  }

  return ok({
    stage: 'processed',
    call_id: call.callId,
    db_ok: dbUp,
    classification: result.classification,
    asked_pricing: result.asked_pricing,
    emailed: Boolean(emailId),
    hubspot_deal_id: dealId,
    price_redactions: result.redactions.length,
    overrides: result.overrides,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    note: 'Vaani posts here. Add ?token=<VAANI_WEBHOOK_SECRET> and POST call_started / call_postprocessing.',
  });
}
