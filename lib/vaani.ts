/**
 * Vaani's webhook payload, normalised.
 *
 * Field names vary between Vaani's events and its docs, so every field is looked
 * up across the plausible spellings and the raw payload is kept on the row. After
 * your first real call, check `calls.collected.raw_shape` and tighten these if
 * something landed null.
 */

export type VaaniEvent = 'call_started' | 'call_ended' | 'call_postprocessing' | 'unknown';

export type NormalisedCall = {
  event: VaaniEvent;
  callId: string | null;
  callerNumber: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMsRaw: unknown;
  transcript: string;
  summary: string | null;
  recordingUrl: string | null;
  entities: Record<string, unknown>;
  bookedSlot: string | null;
  rawKeys: string[];
};

function pick(obj: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    const parts = k.split('.');
    let cur: any = obj;
    for (const p of parts) cur = cur?.[p];
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Vaani sends "[00:00:04] AGENT: text" lines, or an array of turns. Either becomes lines. */
export function normaliseTranscript(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map((l) => l.replace(/^\s*\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, '').trim())
      .filter(Boolean)
      .join('\n');
  }
  if (Array.isArray(raw)) {
    return raw
      .map((t: any) => {
        const who = String(t?.role ?? t?.speaker ?? t?.from ?? 'USER').toUpperCase();
        const said = String(t?.content ?? t?.text ?? t?.message ?? '').trim();
        if (!said) return '';
        const label = who.includes('AGENT') || who.includes('ASSISTANT') || who.includes('BOT')
          ? 'AGENT' : 'USER';
        return `${label}: ${said}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function normalise(payload: Record<string, any>): NormalisedCall {
  const p = payload ?? {};
  const body = p.data ?? p.call ?? p.payload ?? p;

  const rawEvent = String(
    pick(p, ['event', 'event_type', 'type', 'eventName', 'webhook_event', 'call_status', 'status']) ?? '',
  ).toLowerCase();
  const transcript = normaliseTranscript(
    pick(body, ['transcript', 'transcript_text', 'messages', 'turns', 'conversation']),
  );
  const summary = pick(body, ['summary', 'call_summary', 'short_summary'])?.toString() ?? null;

  // Only post-processing carries the finished transcript. call_ended arrives earlier and
  // may carry a partial one — classifying on it would poison the idempotency guard and
  // make the real post-processing event look like a duplicate.
  //
  // Vaani does not always send an event field, so when it is absent the shape decides:
  // a payload carrying a transcript or summary is the finished call, anything else is
  // the start. Without this, a call that never names its event is silently dropped.
  const byName: VaaniEvent | null = rawEvent.includes('post')
    ? 'call_postprocessing'
    : rawEvent.includes('start') || rawEvent.includes('initiat')
      ? 'call_started'
      : rawEvent.includes('ring')
        ? 'unknown'
        : rawEvent.includes('end') || rawEvent.includes('complete') || rawEvent.includes('hangup')
          ? 'call_ended'
          : null;

  const event: VaaniEvent =
    byName ?? (transcript || summary ? 'call_postprocessing' : 'call_started');

  const entities =
    (pick(body, ['entities', 'extracted_entities', 'post_call_data', 'variables']) as Record<
      string, unknown
    > | null) ?? {};

  return {
    event,
    // Vaani is LiveKit underneath: the stable per-call identifier is room_name.
    // call_id appears in the docs but not in the payloads it actually sends.
    callId: pick(body, [
      'call_id', 'callId', 'room_name', 'roomName', 'room', 'room_id',
      'id', 'conversation_id', 'session_id', 'call_sid', 'sid',
    ])?.toString() ?? null,
    callerNumber: pick(body, [
      'caller_number', 'from_number', 'from', 'customer_number', 'phone_number', 'caller.number',
    ])?.toString() ?? null,
    startedAt: toDate(pick(body, ['call_started_at', 'started_at', 'start_time', 'created_at'])),
    endedAt: toDate(pick(body, ['call_ended_at', 'ended_at', 'end_time', 'completed_at'])),
    durationMsRaw: pick(body, ['call_duration', 'duration_ms', 'duration']),
    transcript,
    summary,
    recordingUrl: pick(body, ['recording_url', 'recordingUrl', 'audio_url', 'recording'])?.toString() ?? null,
    entities,
    bookedSlot: pick({ ...body, ...entities }, ['booked_slot', 'bookedSlot', 'slot', 'appointment_time'])?.toString() ?? null,
    rawKeys: Object.keys(body ?? {}),
  };
}
