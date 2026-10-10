import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterText, containsPrice, filterFields } from '../lib/price-filter.ts';

// --- things the studio must never say -------------------------------------
const MUST_REDACT: [string, string][] = [
  ['rupee total', 'The project will cost ₹12,50,000 all in.'],
  ['lakh range', 'Expect 12-15 lakh for this scope.'],
  ['lakh single', 'This would be around 8 lakh.'],
  ['per sq ft', 'We charge 1,800 per sq ft for full interiors.'],
  ['per sq ft bare', 'Our rate is per square foot based.'],
  ['psf', 'Roughly 1200 psf.'],
  ['slash sqft', 'About 1,500/sq ft.'],
  ['Rs form', 'Approximately Rs. 9,00,000.'],
  ['INR form', 'INR 14 lakh estimated.'],
  ['ballpark', 'A ballpark would be somewhere near 10 lakh.'],
  ['estimated value', 'Estimated project value 18 lakh.'],
  ['crore', 'The villa would run 1.2 crore.'],
];

for (const [name, input] of MUST_REDACT) {
  test(`redacts: ${name}`, () => {
    const r = filterText('handoff_note', input);
    assert.ok(r.redactions.length > 0, `nothing redacted from: ${input}`);
    assert.ok(!containsPrice(r.value), `price survived: ${r.value}`);
  });
}

// --- the caller's own number survives -------------------------------------
const MUST_KEEP: [string, string][] = [
  ['attributed to caller', "Caller volunteered a budget of ₹1-1.5 lakh for the full flat."],
  ['caller said', 'The caller said their budget is 18-22 lakh.'],
  ['client mentioned', 'Client mentioned 5 lakh as a ceiling.'],
  ['possessive', "Caller's budget: ₹4-5 lakh."],
  ['according to', 'According to the caller, 20 lakh is available.'],
];

for (const [name, input] of MUST_KEEP) {
  test(`keeps caller's own figure: ${name}`, () => {
    const r = filterText('handoff_note', input);
    assert.equal(r.redactions.length, 0, `wrongly redacted: ${JSON.stringify(r)}`);
  });
}

// --- measurements are not money ------------------------------------------
test('does not touch areas, dates or counts', () => {
  const text =
    '3BHK in Kothrud, about 1,400 sq ft carpet. Possession in 6 weeks. 20 workstations. Move in by March 2027.';
  const r = filterText('handoff_note', text);
  assert.equal(r.redactions.length, 0, JSON.stringify(r.redactions));
  assert.equal(r.value, text);
});

test('redacts a studio price in one sentence while keeping the caller figure in the next', () => {
  const r = filterText(
    'handoff_note',
    "Caller said their budget is 15 lakh. Our cost for this would be around 22 lakh.",
  );
  assert.ok(r.value.includes('15 lakh'), `caller figure lost: ${r.value}`);
  assert.ok(!r.value.includes('22 lakh'), `studio figure survived: ${r.value}`);
});

test('filterFields leaves exempt fields alone and reports the field name', () => {
  const r = filterFields(
    { handoff_note: 'Quote of 10 lakh.', volunteered_budget: '₹1-1.5 lakh', fit_reason: 'Scope fine.' },
    ['handoff_note', 'fit_reason'],
  );
  assert.equal(r.value.volunteered_budget, '₹1-1.5 lakh');
  assert.ok(!containsPrice(r.value.handoff_note));
  assert.equal(r.redactions[0]?.field, 'handoff_note');
});
