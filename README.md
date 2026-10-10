# Aangan Studio — AI call agent

**Live:** https://aangan-voice-agent-psi.vercel.app (dashboard is password-protected, user `aangan`)
**Repo:** https://github.com/aaditaa/aangan-voice-agent

MESA Case 03. Aangan Studio is an interior design studio in Pune. About half its phone
enquiries get no reply within 48 hours, and a third arrive when the front desk is closed.
This answers every call, qualifies it against Nikhil's own rubric, books a consultation
during the call, and hands the designer a note they can read on a phone.

**It never quotes a price.** That is the Cut, and it is enforced in three places, not one.

---

## The flow

```
Caller ─► Vaani AI voice agent (answers, qualifies, books a slot)
             │  webhook: call_started + call_postprocessing
             ▼
       /api/vaani/webhook  (Next.js on Vercel)
             │  log ─► Supabase (calls, designers, daily_metrics)
             ▼
       Gemini Flash, JSON mode, against qualified.md + services.md
             │
             ├─ price filter strips any studio-voiced figure
             │
   qualified ┼─► designer email (Resend): Claim / Reschedule / Booking link
             ├─► HubSpot deal (optional, best-effort)
   complaint ┼─► front-desk email — a human calls back
   not_fit   ┼─► logged only
   unclear   ┘
             ▼
       Dashboard: calls, after-hours, qualified, booked, show-ups, won, cost,
                  and how many prices the filter blocked
```

---

## The Nine Checks

**⚡ Kill switches — any No means don't build it**

**01 Is the problem real? YES.**
Verified in the case pack itself: of the 20 September phone enquiries, **T08 is a missed
call at 10:47pm** with no voicemail and a callback the next morning that went unanswered —
one lead, gone, with a paper trail. **T16 is an enquiry taken on a Monday and never followed
up**; the pack's own note reads "Enquiry originally received Monday — no follow-up. Re-logged
Friday. Caller frustrated." Three of the 20 calls (T07 9:44am, T08 10:47pm, T20 9:15am) came
outside the staffed 10am–7pm window. The brief's wider figures — ~200 enquiries a month, 48%
unanswered within 48 hours, a reply inside an hour converting 4× better — come from the case
statement.

**02 Is the workflow repeated? YES.**
~200 enquiries a month, and the opening moves are identical every time: take the name, the
space, the locality, the scope, the timeline, the decision-maker. Twenty transcripts, the
same first four questions in all of them.

**03 Is the input available? YES, partly.**
`qualified.md` is Nikhil's rubric, written by him, and `services.md` defines scope, service
area and timelines. Both are loaded verbatim. `pricing.md` exists in the case pack and is
**deliberately not in this repo** — see the Cut.

**📊 Sizing — any No means build something smaller**

**04 Is the output valuable? YES.**
A consultation booked during the call on a project in the ₹8–14 lakh band (case statement).
Twelve of the 20 September phone enquiries qualify under the rubric.

**05 Is the impact measurable? YES.**
Time to first response, consultations booked, show-up rate and won value are all on the
dashboard from day one, via the `daily_metrics` view. Show-up and won are written back by
the studio; everything else is captured automatically.

**08 Is the ROI worth it? YES.**
The cost per call is a few rupees of voice time plus a fraction of a paisa of model tokens,
both shown live on the dashboard. One recovered consultation covers a month of it many times
over.

**🚧 Boundary — any No means put a human exactly here**

**06 Is the failure risk OK? YES for answering, qualifying and booking. NO for pricing.**
A wrong classification costs a callback. A wrong price is heard as a commitment and cannot be
withdrawn. So pricing is not delegated at all.

**07 Is judgment protected? PARTLY — by design.**
Quoting, committing to site visits or dates, and complaints all stay with humans. Complaints
(T09) are routed to the front desk untouched; the agent takes a message and does not try to
resolve anything.

**09 Is the owner clear? YES.**
The agent qualifies and books. The designer owns the relationship from the Claim link onward.
Nikhil owns the price.

---

## The Cut

> Quoting standard per-sq-ft pricing.

Nikhil asked for it. The agent does not do it. A price said in the studio's voice is heard as
a commitment, and it cannot be taken back — so the agent says *"Your designer will walk you
through pricing on the consultation, because it depends on your site and your choices."*

Enforced three times over, because a prompt is a request, not a guarantee:

1. **The rate card is never in the room.** `knowledge/` holds only `qualified.md` and
   `services.md`. [`lib/knowledge.ts`](lib/knowledge.ts) refuses to load at all if
   `pricing.md` ever appears, and ignores any file not on the allowlist.
2. **The output is filtered in code.** [`lib/price-filter.ts`](lib/price-filter.ts) strips
   rupee figures, lakh/crore amounts, per-sq-ft rates and estimate language from every
   free-text field before a human sees it — while letting through a budget the *caller*
   volunteered, because that is the caller's statement and the designer needs it.
   20 unit tests cover both directions: `npm test`.
3. **Asking about price cannot disqualify anyone.** The rubric says so explicitly, so
   `enforcePricingNeverDisqualifies` in [`lib/classify.ts`](lib/classify.ts) overrides a
   `not_fit` that cites pricing when the caller never volunteered a budget, and records the
   override on the row. A volunteered budget that is genuinely too low (T10) still stands.

The dashboard shows a running count of figures the filter blocked.

---

## Component map

| Piece | File | Job |
|---|---|---|
| Voice agent | [`vaani/agent-setup.md`](vaani/agent-setup.md) | Answers, qualifies, books. Never quotes. |
| Webhook | [`app/api/vaani/webhook/route.ts`](app/api/vaani/webhook/route.ts) | `call_started` + `call_postprocessing`, token auth, idempotent |
| Payload normaliser | [`lib/vaani.ts`](lib/vaani.ts) | Vaani's field names vary; one shape out |
| Classifier | [`lib/classify.ts`](lib/classify.ts) | Gemini Flash, JSON schema, rubric verbatim |
| The Cut | [`lib/price-filter.ts`](lib/price-filter.ts) | Strips studio-voiced prices, keeps the caller's |
| Knowledge guard | [`lib/knowledge.ts`](lib/knowledge.ts) | Allowlist; fails loudly if `pricing.md` appears |
| Database | [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) | `calls`, `designers`, `daily_metrics`; RLS on |
| Designer email | [`lib/email.ts`](lib/email.ts) | Handoff note first, then detail, then one-tap Claim |
| Signed links | [`lib/links.ts`](lib/links.ts) | HMAC; GET confirms, POST acts |
| CRM | [`lib/hubspot.ts`](lib/hubspot.ts) | Deal per qualified lead. Optional, never blocking |
| Dashboard | [`app/page.tsx`](app/page.tsx) | Results and running cost, behind basic auth |
| Dry run | [`app/api/eval/route.ts`](app/api/eval/route.ts) | Classify a transcript with no row, email or deal |
| Eval harness | [`evals/run.ts`](evals/run.ts) | All 20 September enquiries, scored, cached |

---

## Setup

### 1. Accounts (all free)

| Service | For | Key from |
|---|---|---|
| Supabase | Database | New project, region Mumbai. Free plan allows 2 active projects |
| Gemini | Classification | aistudio.google.com → Get API key |
| Resend | Email | resend.com → API Keys → Create (Sending access) |
| Vercel | Hosting | Sign in with GitHub |
| Vaani AI | Voice | app.vaanivoice.ai — free test minutes, use them carefully |
| HubSpot | Deals | Settings → Integrations → Private apps. Scopes: contacts + deals read/write |
| Cal.com | Fallback booking link | Your 30-minute event link |

### 2. Database

Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in Supabase →
SQL Editor, then `0002_seed_designer.sql` with your own email in it — on Resend's sandbox,
`onboarding@resend.dev` only delivers to your signup address.

### 3. Environment

Copy [`.env.example`](.env.example) into Vercel → Settings → Environment Variables. Paste the
values there yourself; never into a chat. **Redeploy after any change.**

The service-role key is the **secret** one, not the publishable one. Paste it into the *value*
field, not the name field.

### 4. Vaani

Follow [`vaani/agent-setup.md`](vaani/agent-setup.md): paste the system prompt, then add the
webhook at `https://<your-app>.vercel.app/api/vaani/webhook?token=<VAANI_WEBHOOK_SECRET>` for
**Call Started** and **Call Post-Processing**, with "send all call details" ticked.

---

## Testing

### Replay the real September enquiries

All 20 phone transcripts from the case pack are in [`evals/transcripts/`](evals/transcripts),
with expected answers and the deciding criterion for each in
[`evals/expected.json`](evals/expected.json).

The harness reads `.env.local`, so put the key there first — Vercel's variables are not
visible to a local script:

```bash
cp .env.example .env.local     # then fill in at least these two:
#   GEMINI_API_KEY=...
#   GEMINI_MODEL=gemini-2.5-flash
```

```bash
npm run eval -- --limit 5     # five at a time; the free tier allows ~20 requests a day
npm run eval                  # all 20 once you have quota
npm run eval -- --only T02,T10,T13
```

Results are cached in `evals/.cache`, so re-running costs nothing and only successful calls
count against quota. To test the deployed route instead of the local classifier:

```bash
npm run eval -- --url https://your-app.vercel.app   # needs VAANI_WEBHOOK_SECRET locally too
```

The run prints a scored table, the number of prices the filter blocked, the model cost, and a
pass/fail line for the Cut.

### The Cut, on its own

```bash
npm test
```

20 cases: twelve shapes of price that must be stripped, five caller-volunteered figures that
must survive, and measurements (sq ft, weeks, counts) that must not be mistaken for money.

### One real call

Vaani → Start Test → Test with a Phone Call. Ask for a price, then accept a slot. Then check
the dashboard, your inbox, HubSpot → Deals, and the `calls` row.

---

## What is verified, and what needs your keys

Built and checked here:

- `npm run build` — clean. `npx tsc --noEmit` — clean. `npm test` — 20/20.
- All 20 transcripts extracted from the case PDF and parsed, including the missed call (T08)
  and the dropped-then-redialled call (T17).
- The eval harness scored end to end against seeded results, including a deliberately
  injected price leak, which it caught.

Verified against the live deployment:

- Supabase project `aangan-voice-agent` (ap-south-1) created, both migrations applied,
  RLS on, one designer seeded.
- Deployed to Vercel. Dashboard returns 401 without credentials; both API routes return
  401 on a bad token.
- Two real classifications through the deployed `/api/eval` on `gemini-3.8-flash`:
  T02 → `qualified` with `asked_pricing` true, T10 → `not_fit` on "4 volunteered budget"
  with the caller's figure held in its own field and no price in the handoff note.

**Eval: 20/20 on the real September phone enquiries**, on `gemini-3.8-flash`. Every
classification correct, including the four that decide on different criteria — T03 service
area, T07 timeline, T10 a volunteered budget that is too low, T09 an existing client's
complaint — and the two callers who pressed for a price (T02, T13), both of whom qualified,
with the figure stripped by the filter. The Cut held on all twenty: no price in the studio's
voice in any output.

Run `npm run eval` to reproduce; results are cached in `evals/.cache`.

One real call has also been through the live webhook end to end: row written to Supabase,
lead classified `qualified`, designer emailed, dashboard updated, cost recorded.

Not yet exercised:

- HubSpot deals — optional, skipped cleanly when `HUBSPOT_PRIVATE_APP_TOKEN` is empty.
- A real Vaani phone call (needs a paid number or Vaani's test call).

---

## Gotchas

- **Gemini model closed.** Older Flash models return 404 "no longer available to new users".
  The classifier says so explicitly if it happens — pick a current Flash model in AI Studio.
- **Vaani webhooks are unsigned**, so the secret rides in the URL and is compared in constant time.
- **`call_duration` is in milliseconds and sometimes missing.** Derived from start → end as a
  fallback ([`lib/time.ts`](lib/time.ts)).
- **Resend sandbox** delivers only to your signup address. Use it for both the designer and
  the front desk.
- **Supabase free plan allows 2 active projects.** Pause an old one if creation fails.
- **Email link scanners click everything**, so Claim and Reschedule confirm on GET and only
  act on POST.
- **Inbound phone numbers cost money.** Demo with Vaani's test call and say so out loud.
- **Never commit `.env`.** Rotate any key that has been pasted into a chat.
