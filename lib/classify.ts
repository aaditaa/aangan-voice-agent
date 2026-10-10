import { env, required, num } from './env.ts';
import { loadKnowledge } from './knowledge.ts';
import { filterFields, type Redaction } from './price-filter.ts';

export type Classification = 'qualified' | 'not_fit' | 'complaint' | 'unclear';

export type Lead = {
  name: string | null;
  phone: string | null;
  locality: string | null;
  property_type: string | null;
  carpet_area_sqft: string | null;
  scope: string | null;
  timeline: string | null;
  volunteered_budget: string | null;
  decision_maker: string | null;
  source: string | null;
};

export type ClassificationResult = {
  classification: Classification;
  deciding_criterion: string;
  fit_reason: string;
  asked_pricing: boolean;
  segment: 'home' | 'office' | 'unknown';
  lead: Lead;
  notes_for_human: string;
  handoff_note: string;
  /** audit trail, set by this module — not by the model */
  redactions: Redaction[];
  overrides: string[];
  usage: { input_tokens: number; output_tokens: number; cost_inr: number };
  model: string;
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    classification: { type: 'STRING', enum: ['qualified', 'not_fit', 'complaint', 'unclear'] },
    deciding_criterion: { type: 'STRING' },
    fit_reason: { type: 'STRING' },
    asked_pricing: { type: 'BOOLEAN' },
    segment: { type: 'STRING', enum: ['home', 'office', 'unknown'] },
    lead: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', nullable: true },
        phone: { type: 'STRING', nullable: true },
        locality: { type: 'STRING', nullable: true },
        property_type: { type: 'STRING', nullable: true },
        carpet_area_sqft: { type: 'STRING', nullable: true },
        scope: { type: 'STRING', nullable: true },
        timeline: { type: 'STRING', nullable: true },
        volunteered_budget: { type: 'STRING', nullable: true },
        decision_maker: { type: 'STRING', nullable: true },
        source: { type: 'STRING', nullable: true },
      },
    },
    notes_for_human: { type: 'STRING' },
    handoff_note: { type: 'STRING' },
  },
  required: [
    'classification', 'deciding_criterion', 'fit_reason', 'asked_pricing',
    'segment', 'lead', 'notes_for_human', 'handoff_note',
  ],
} as const;

function systemInstruction(): string {
  const k = loadKnowledge();
  return `You read a transcript of one phone enquiry to Aangan Studio, an interior design studio in Pune, and return a structured review for the designer who will pick it up.

You are not speaking to the caller. You are writing for a designer reading this on a phone between site visits.

=== NIKHIL'S RUBRIC (verbatim — this decides fit) ===
${k.qualified}

=== WHAT THE STUDIO DOES (verbatim — this decides scope and service area) ===
${k.services}
=== END ===

HOW TO CLASSIFY

"qualified" — passes all five criteria. Per the rubric: if criterion 4 (budget) or 5
(decision-maker) is merely UNCLEAR, treat as qualified and record the uncertainty in
notes_for_human. A single room with full execution qualifies. A rented flat with no
structural changes qualifies. An office up to ~3,000 sq ft qualifies.

"not_fit" — fails a criterion on the evidence in the transcript: outside Pune/PCMC;
advice, ideas or decor only; restaurant, hotel, retail or gym; structural work; a
timeline that cannot be served (execution needs 8–16 weeks, and nothing can be ready
in under 6 weeks); below minimum scope; or a budget the caller VOLUNTEERED that is
clearly far below the described scope. Per the rubric, two or more failing criteria
mean decline gracefully.

"complaint" — an existing client with a problem, or a caller who is angry about work
already under way. A human handles these; do not try to resolve anything.

"unclear" — a dropped call, a missed call, or so little information that no criterion
can be assessed.

DECIDING CRITERION
Name the one criterion that decided it, as a short phrase: "1 real project",
"2 service area", "3 timeline", "4 volunteered budget", "5 decision-maker",
"scope below minimum", "existing client complaint", "insufficient information",
or "all five pass".

THE ONE RULE YOU NEVER BREAK
Never state a price, rate, per-square-foot figure, range, total or estimate — not in
fit_reason, not in notes_for_human, not in handoff_note. You have not been given the
studio's rates and you must not infer or invent them. If the caller asked about price,
set asked_pricing true and carry on; asking about price NEVER affects classification.
If the caller volunteered their own budget, put that figure in lead.volunteered_budget
and nowhere else.

HANDOFF NOTE
Exactly 8 short lines, newline-separated, no bullet characters, no markdown. Written
for a phone screen. Cover: who called and from where; the property; the scope; the
timeline; the decision-maker position; how they found Aangan; anything that needs care;
the one thing the designer should establish first.`;
}

function userPrompt(transcript: string, meta: { time?: string; date?: string }): string {
  const when = [meta.date, meta.time].filter(Boolean).join(' ');
  return `${when ? `Call received: ${when} IST\n\n` : ''}TRANSCRIPT\n${transcript.trim()}`;
}

/**
 * Asking about price is explicitly non-disqualifying in Nikhil's rubric, so a model
 * that declines a caller for asking is overruled in code rather than argued with in
 * the prompt. A budget the caller VOLUNTEERED is a different thing and stands.
 */
export function enforcePricingNeverDisqualifies<
  T extends Pick<ClassificationResult, 'classification' | 'fit_reason' | 'deciding_criterion' | 'asked_pricing' | 'lead' | 'notes_for_human'>,
>(r: T): { result: T; overrides: string[] } {
  const overrides: string[] = [];
  if (r.classification !== 'not_fit') return { result: r, overrides };

  const citesPricing = /\bpric|\brate\b|\bcost\b|\bbudget\b|\bquote/i.test(
    `${r.deciding_criterion} ${r.fit_reason}`,
  );
  const volunteered = r.lead?.volunteered_budget;
  const hasVolunteeredNumber = typeof volunteered === 'string' && /\d/.test(volunteered);

  if (citesPricing && !hasVolunteeredNumber) {
    overrides.push('pricing_ask_is_not_disqualifying');
    return {
      result: {
        ...r,
        classification: 'qualified' as Classification,
        deciding_criterion: 'all five pass (pricing-ask override)',
        notes_for_human: [
          r.notes_for_human,
          'Auto-correction: the classifier declined this lead over pricing, but the caller never volunteered a budget. Per the rubric, asking about price does not disqualify. Reclassified as qualified — confirm scope at consultation.',
        ].filter(Boolean).join(' '),
      },
      overrides,
    };
  }
  return { result: r, overrides };
}

const FREE_TEXT = ['fit_reason', 'notes_for_human', 'handoff_note'] as const;

/** Google nests the useful sentence inside a JSON blob; pull it out and keep it on one line. */
async function reason(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const m = (JSON.parse(text) as { error?: { message?: string; status?: string } }).error;
    if (m?.message) return `${m.message}${m.status ? ` (${m.status})` : ''}`.replace(/\s+/g, ' ');
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return text.replace(/\s+/g, ' ').slice(0, 300);
}

export async function classify(
  transcript: string,
  meta: { time?: string; date?: string } = {},
): Promise<ClassificationResult> {
  const model = env('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  const key = required('GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction() }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt(transcript, meta) }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
    },
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        // The ambiguous calls are the slow ones — a borderline lead can take well over
        // 30s. Kept under the route's maxDuration of 60s so the function returns a
        // diagnosis rather than being killed mid-request.
        signal: AbortSignal.timeout(num('GEMINI_TIMEOUT_MS', 45_000)),
      });

      if (res.status === 429) {
        throw new Error(
          'Gemini rate limit (429). The free tier allows roughly 20 requests a day — space the eval out or wait for the quota to reset.',
        );
      }
      if (res.status >= 500) throw new Error(`Gemini ${res.status}: ${await reason(res)}`);
      if (!res.ok) {
        const detail = await reason(res);
        if (res.status === 404) {
          throw new Error(
            `Gemini model "${model}" is not available to this key (404). Older Flash models are closed to new accounts — pick a current one in AI Studio and set GEMINI_MODEL. ${detail}`,
          );
        }
        throw new Error(`Gemini ${res.status}: ${detail}`);
      }

      const json = (await res.json()) as any;
      const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error(`Gemini returned no text: ${JSON.stringify(json).slice(0, 400)}`);

      const parsed = JSON.parse(text) as Omit<ClassificationResult, 'redactions' | 'overrides' | 'usage' | 'model'>;

      // 1. asking about price can never disqualify
      const { result: guarded, overrides } = enforcePricingNeverDisqualifies(parsed);
      // 2. no studio-voiced figure reaches a human
      const { value: clean, redactions } = filterFields(guarded as unknown as Record<string, unknown>, FREE_TEXT);

      const usage = json?.usageMetadata ?? {};
      const inTok = Number(usage.promptTokenCount ?? 0);
      const outTok = Number(usage.candidatesTokenCount ?? 0);

      return {
        ...(clean as unknown as Omit<ClassificationResult, 'redactions' | 'overrides' | 'usage' | 'model'>),
        redactions,
        overrides,
        model,
        usage: {
          input_tokens: inTok,
          output_tokens: outTok,
          cost_inr:
            (inTok / 1_000_000) * num('GEMINI_INR_PER_M_INPUT') +
            (outTok / 1_000_000) * num('GEMINI_INR_PER_M_OUTPUT'),
        },
      };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') || msg.includes('404') || msg.includes('rate limit')) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
