/**
 * THE CUT, enforced in code.
 *
 * The agent never quotes a price. The prompt forbids it and `pricing.md` is never
 * loaded, but a prompt is a request, not a guarantee — so every piece of free text
 * the model produces passes through here before it reaches a human.
 *
 * What is removed: any figure said in the studio's voice — a rate, a per-sq-ft
 * number, a range, an estimate, a total.
 * What survives: a number the caller volunteered about their own budget. That is
 * the caller's statement, not a commitment by the studio, and the designer needs it.
 */

export type Redaction = { field: string; removed: string };
export type FilterResult<T> = { value: T; redactions: Redaction[] };

/** Money and rate shapes. Deliberately broad — a false redaction costs a detail; a miss costs a commitment. */
const PRICE_SHAPES: RegExp[] = [
  // ₹ / Rs / INR followed by a figure, with optional lakh/crore/k suffix
  /(?:₹|\bRs\b\.?|\bINR\b|\brupees\b)\s*[\d][\d,.\s]*(?:\s*(?:-|–|to)\s*[\d][\d,.\s]*)?\s*(?:lakhs?|lacs?|crores?|cr\b|k\b|mn\b|million)?/gi,
  // a bare figure carrying a money unit: "1 to 1.5 lakh", "12–15 lakh", "8 lakh"
  /\b[\d][\d,.]*\s*(?:-|–|to)?\s*[\d,.]*\s*(?:lakhs?|lacs?|crores?)\b/gi,
  // rates, with or without a number attached
  /(?:[\d][\d,.]*\s*(?:-|–|to)\s*[\d][\d,.]*|[\d][\d,.]*)?\s*(?:per\s*(?:sq\.?\s*(?:ft|foot|feet)|square\s*(?:ft|foot|feet)|sft)|\/\s*sq\.?\s*ft|psf\b)/gi,
  // the language of estimating, even when the number is spelled out
  /\b(?:ballpark|rough(?:ly)?\s+(?:cost|price|estimate)|estimated?\s+(?:cost|price|budget|value)|price\s+range|cost\s+range|quote\s+of|quoted\s+at)\b[^.;\n]*/gi,
];

/** Cues that a figure belongs to the caller, not to us. */
const CALLER_ATTRIBUTION =
  /\b(?:caller|client|customer|she|he|they|prospect)\b[^.;\n]{0,40}\b(?:said|says|stated|mentioned|volunteered|shared|indicated|quoted|gave|has|had|is\s+working\s+with)\b|\b(?:volunteered|self-reported|caller's|client's|their\s+own)\b|\bbudget\s+(?:mentioned|volunteered|stated|shared)\b|\baccording\s+to\s+the\s+(?:caller|client)\b/i;

const PLACEHOLDER = '[price withheld — designer discusses at consultation]';

/**
 * Split into sentence-ish units so one caller-attributed figure doesn't whitelist a whole
 * paragraph. Splits only at a terminator followed by whitespace and a new sentence, so
 * decimals ("1.5 lakh") stay in one piece.
 */
function units(text: string): string[] {
  return text.split(/\n+|(?<=[.;!?])\s+(?=[A-Z"'(\[]|$)/).filter((s) => s && s.length > 0);
}

export function containsPrice(text: string): boolean {
  return PRICE_SHAPES.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/** Strip studio-voiced prices from one free-text field. */
export function filterText(field: string, text: string): FilterResult<string> {
  const redactions: Redaction[] = [];
  const cleaned = units(text)
    .map((unit) => {
      if (!containsPrice(unit)) return unit;
      if (CALLER_ATTRIBUTION.test(unit)) return unit; // the caller's own number — keep it
      let out = unit;
      for (const re of PRICE_SHAPES) {
        out = out.replace(re, (match) => {
          const trimmed = match.trim();
          if (!trimmed) return match;
          redactions.push({ field, removed: trimmed });
          return PLACEHOLDER;
        });
      }
      // collapse runs of placeholders left by overlapping patterns
      return out.replace(new RegExp(`(?:${escapeRe(PLACEHOLDER)}\\s*){2,}`, 'g'), `${PLACEHOLDER} `);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { value: cleaned, redactions };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Run the filter across every free-text field of a classification.
 * `exempt` fields hold the caller's own words (e.g. volunteered_budget) and pass through.
 */
export function filterFields<T extends Record<string, unknown>>(
  obj: T,
  fields: readonly string[],
): FilterResult<T> {
  const out = { ...obj } as Record<string, unknown>;
  const redactions: Redaction[] = [];
  for (const f of fields) {
    const v = out[f];
    if (typeof v !== 'string' || v.length === 0) continue;
    const r = filterText(f, v);
    out[f] = r.value;
    redactions.push(...r.redactions);
  }
  return { value: out as T, redactions };
}
