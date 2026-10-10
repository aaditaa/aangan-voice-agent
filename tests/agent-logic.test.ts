import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseTranscript, normalise } from '../lib/vaani.ts';
import { isAfterHours, durationSeconds } from '../lib/time.ts';
import { enforcePricingNeverDisqualifies } from '../lib/classify.ts';

// --- Vaani transcript shapes ---------------------------------------------
test('strips Vaani timestamps from a transcript string', () => {
  const out = normaliseTranscript(
    '[00:00:01] AGENT: Good afternoon.\n[00:00:06] USER: I have a 2BHK in Wakad.',
  );
  assert.equal(out, 'AGENT: Good afternoon.\nUSER: I have a 2BHK in Wakad.');
});

test('accepts an array of turns and labels the speakers', () => {
  const out = normaliseTranscript([
    { role: 'assistant', content: 'Good morning, Aangan Studio.' },
    { role: 'user', content: 'Hi, I am Priya.' },
    { speaker: 'BOT', text: 'How can I help?' },
  ]);
  assert.equal(out, 'AGENT: Good morning, Aangan Studio.\nUSER: Hi, I am Priya.\nAGENT: How can I help?');
});

test('reads the call id and number from a nested payload', () => {
  const n = normalise({ event: 'call_postprocessing', data: { call_id: 'c1', from_number: '+9199' } });
  assert.equal(n.event, 'call_postprocessing');
  assert.equal(n.callId, 'c1');
  assert.equal(n.callerNumber, '+9199');
});

test('recognises the started event under any spelling', () => {
  for (const e of ['call_started', 'CALL.STARTED', 'callStarted']) {
    assert.equal(normalise({ event_type: e, call: { id: 'x' } }).event, 'call_started', e);
  }
});

test('post-processing wins over any other wording — it carries the finished transcript', () => {
  for (const e of ['call_postprocessing', 'CALL_POST_PROCESSING', 'call.postprocessing.completed']) {
    assert.equal(normalise({ event: e, data: { id: 'x' } }).event, 'call_postprocessing', e);
  }
});

test('call_ended is its own event, never mistaken for post-processing', () => {
  for (const e of ['call_ended', 'CALL.ENDED', 'call_hangup', 'call_complete']) {
    assert.equal(normalise({ event: e, data: { id: 'x' } }).event, 'call_ended', e);
  }
});

test('call_ringing is ignored rather than treated as the end of the call', () => {
  assert.equal(normalise({ event: 'call_ringing', data: { id: 'x' } }).event, 'unknown');
});

// --- duration: milliseconds, and sometimes absent -------------------------
test('timestamps win over the reported duration, whatever its unit', () => {
  const start = new Date('2026-09-02T10:23:00+05:30');
  const end = new Date('2026-09-02T10:27:12+05:30');
  assert.equal(durationSeconds(undefined, start, end), 252);
  assert.equal(durationSeconds(0, start, end), 252);
  assert.equal(durationSeconds(252, start, end), 252);      // seconds
  assert.equal(durationSeconds(252000, start, end), 252);   // milliseconds
  assert.equal(durationSeconds('nonsense', start, end), 252);
});

test('a real 208-second call is not rounded away to zero', () => {
  // Regression: call_duration arrived as 208 (seconds). Dividing by 1000 gave 0,
  // which zeroed the cost column on the dashboard.
  const start = new Date('2026-10-10T16:33:31.599Z');
  const end = new Date('2026-10-10T16:36:59.835Z');
  assert.equal(durationSeconds(208, start, end), 208);
  assert.equal(durationSeconds(208, null, null), 208);
});

test('without timestamps, the unit is inferred from magnitude', () => {
  assert.equal(durationSeconds(252, null, null), 252);       // plainly seconds
  assert.equal(durationSeconds(252000, null, null), 252);    // plainly milliseconds
  assert.equal(durationSeconds(45, null, null), 45);         // a short call
});

test('duration is zero rather than negative or NaN when nothing is known', () => {
  assert.equal(durationSeconds(undefined, null, null), 0);
  assert.equal(durationSeconds('nonsense', null, null), 0);
});

// --- after hours is 10:00-19:00 IST, and the real September calls prove it -
test('the three after-hours September calls are flagged, the staffed ones are not', () => {
  const ah = (iso: string) => isAfterHours(new Date(iso));
  assert.equal(ah('2026-09-08T09:44:00+05:30'), true,  'T07 09:44 is before opening');
  assert.equal(ah('2026-09-09T22:47:00+05:30'), true,  'T08 22:47 is after closing');
  assert.equal(ah('2026-09-25T09:15:00+05:30'), true,  'T20 09:15 is before opening');
  assert.equal(ah('2026-09-02T10:23:00+05:30'), false, 'T01 10:23 is staffed');
  assert.equal(ah('2026-09-24T16:02:00+05:30'), false, 'T19 16:02 is staffed');
});

test('office hours boundaries land on the right side', () => {
  assert.equal(isAfterHours(new Date('2026-09-02T10:00:00+05:30')), false);
  assert.equal(isAfterHours(new Date('2026-09-02T18:59:00+05:30')), false);
  assert.equal(isAfterHours(new Date('2026-09-02T19:00:00+05:30')), true);
});

test('after hours is judged in IST, not in the server timezone', () => {
  // 06:00 UTC is 11:30 IST — staffed, even though UTC says early morning.
  assert.equal(isAfterHours(new Date('2026-09-02T06:00:00Z')), false);
});

// --- asking about price can never disqualify ------------------------------
const base = {
  classification: 'not_fit' as const,
  deciding_criterion: '4 budget',
  fit_reason: 'Caller asked for pricing twice, so pricing is a blocker.',
  asked_pricing: true,
  notes_for_human: '',
  lead: { volunteered_budget: null } as never,
};

test('a not_fit that blames the pricing question is overruled', () => {
  const { result, overrides } = enforcePricingNeverDisqualifies({ ...base });
  assert.equal(result.classification, 'qualified');
  assert.deepEqual(overrides, ['pricing_ask_is_not_disqualifying']);
  assert.match(result.notes_for_human, /asking about price does not disqualify/i);
});

test('a volunteered budget that is genuinely too low still declines (T10)', () => {
  const { result, overrides } = enforcePricingNeverDisqualifies({
    ...base,
    deciding_criterion: '4 volunteered budget',
    fit_reason: 'Caller volunteered a budget far below the scope.',
    lead: { volunteered_budget: '1 to 1.5 lakh' } as never,
  });
  assert.equal(result.classification, 'not_fit');
  assert.deepEqual(overrides, []);
});

test('other classifications are never touched by the pricing guard', () => {
  for (const c of ['qualified', 'complaint', 'unclear'] as const) {
    const { result, overrides } = enforcePricingNeverDisqualifies({ ...base, classification: c as never });
    assert.equal(result.classification, c);
    assert.deepEqual(overrides, []);
  }
});

test('a not_fit for a real reason is left alone', () => {
  const { result, overrides } = enforcePricingNeverDisqualifies({
    ...base,
    deciding_criterion: '2 service area',
    fit_reason: 'Property is in Nashik, outside Pune and PCMC.',
  });
  assert.equal(result.classification, 'not_fit');
  assert.deepEqual(overrides, []);
});

// --- the payloads Vaani actually sends ------------------------------------
// Taken from production logs: no call_id, no event field. The identifier is
// room_name (Vaani runs on LiveKit) and the event has to be inferred.

test('a real Vaani call_started payload yields an id and the start event', () => {
  const n = normalise({
    room_name: 'call-abc123', phone_number: '+919876543210',
    call_type: 'inbound', agent_name: 'Interior Design',
  });
  assert.equal(n.callId, 'call-abc123');
  assert.equal(n.callerNumber, '+919876543210');
  assert.equal(n.event, 'call_started');
});

test('the shorter ringing-shaped payload still resolves an id', () => {
  const n = normalise({ room_name: 'call-abc123', phone_number: '+919876543210' });
  assert.equal(n.callId, 'call-abc123');
});

test('a payload carrying a transcript is treated as the finished call', () => {
  const n = normalise({
    room_name: 'call-abc123', phone_number: '+919876543210',
    transcript: 'AGENT: Good morning.\nUSER: I have a 3BHK in Baner.',
  });
  assert.equal(n.event, 'call_postprocessing');
  assert.match(n.transcript, /3BHK in Baner/);
});

test('a summary alone is enough to count as the finished call', () => {
  const n = normalise({ room_name: 'r1', summary: 'Caller wants a full redesign.' });
  assert.equal(n.event, 'call_postprocessing');
});

test('an explicit event name still wins over the inferred one', () => {
  const n = normalise({
    event: 'call_started', room_name: 'r1', transcript: 'AGENT: Hello.',
  });
  assert.equal(n.event, 'call_started');
});
