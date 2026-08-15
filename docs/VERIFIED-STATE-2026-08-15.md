# Verified production state — 2026-08-15

Evidence-backed findings from an independent re-audit. Every line here was
verified against live services in this session, not carried over from a prior
report. Companion to `LAUNCH-READINESS.md` and `areas/finders-book.md`.

---

## 1. The Gap Check nurture starts at confirmation, not at signup

A controlled brand-new signup was run against production:

| Step | Result |
|---|---|
| `POST /api/gap-check-subscribe` | 200, signed token issued |
| `GET /api/gap-check-download` | 200, 117,750 bytes, correct attachment headers |
| Tampered token | 403 |
| Subscriber created in Leads | yes |
| Subscriber status | **unconfirmed**, `opted_in_at` null, `optin_ip` null |
| Gap Check workflow entrants | **0** |

**Double opt-in for API subscribers is ON.** Proof: the two pre-existing leads
are `active` and carry real `opted_in_at` timestamps plus `optin_ip` values; the
API-created lead has both null.

Consequence to remember when reasoning about this funnel: a lead who downloads
the PDF but never clicks the confirmation email stays in Leads permanently,
receives no nurture email, and is unreachable by campaigns — MailerLite delivers
only to `active` subscribers.

This is correct, compliant behaviour and the site discloses it (`motion.js`:
"Check your inbox — a confirmation link is also on its way"; `index.html`:
"Confirm once by email"). **No code change is warranted.** Treat the
confirmation click as a real funnel stage and monitor it.

The Leads group reported `unconfirmed_count: 2` — one was the QA test address
(since removed), the other is a real lead who never confirmed.

## 2. Payhip webhook has no observed successful delivery

Vercel production runtime logs, 7-day window: `/api/payhip-webhook` received 9
requests — **8 x 405** (audit GET probes) and **1 x 401** (a token-less POST,
logged as `[payhip] rejected: bad or missing URL token`, i.e. the fail-closed
path behaving correctly). No legitimate Payhip event reached the endpoint.

This does not prove misconfiguration — no sale may have occurred in the window —
but the Payhip -> Vercel -> MailerLite path has never been observed succeeding
end to end. Countervailing evidence that a sale happened at some point: All
Customers = 1 and Essentials Buyers = 1, matching GA4 `purchase` = 1.

Until a signed event returns 200, treat purchase segmentation as unproven.

## 3. Live list size

| Group | Subscribers |
|---|---|
| Leads | 2 |
| All Customers | 1 |
| Essentials Buyers | 1 |
| Ultimate / Family Bundle / Refunded / Review Requested | 0 |
| Contact: Presale Question / Reader Feedback / Licensing | 0 |

Account total: 5. The launch segment resolves to 2 real people, which is why the
three FB-LAUNCH campaigns remain unscheduled drafts — the sequence can only be
spent once.

## 4. Contact alerting is solved

Storing a contact in MailerLite never notified anyone. MailerLite has no native
"notify an internal address on group join", so alerting now runs as a scheduled
cloud job: it reads the three contact groups daily at 08:00 PT and raises a push
and email notification when a message arrived in the previous 24h. Read-only
against MailerLite.

## 5. Three actions that cannot be automated

Confirmed against tool schemas, not assumed:

1. **GA4 Key Events are read-only via API.** Creation, updates and deletion
   require the Google Analytics UI. Marking `lead_submit` and `checkout_click`
   is unavoidably manual.
2. **MailerLite automations have no enable/disable API.** The connector exposes
   create, delete, delay/email edits, dry-run and test-send — no state toggle.
   Activation is dashboard-only.
3. **Campaign settings cannot be patched.** `update_campaign` accepts only name,
   subject, from, from_name and content. Pushing content through it is what
   destroyed three designed automation emails in the earlier connector incident.
   Toggling FB-LAUNCH-03's Google Analytics auto-tagging must be done in the UI.

## 6. DNS facts (nameservers are Vercel)

`familyfindersbook.com` is served by `ns1/ns2.vercel-dns.com`, so DNS is edited
in the Vercel dashboard. Records currently at the apex that must not be removed:

- `v=spf1 include:_spf.mlsend.com include:spf.privateemail.com ~all`
- `mailerlite-domain-verification=...`
- `_dmarc`: `v=DMARC1; p=none; rua=mailto:info@familyfindersbook.com`
- MX: `mx1/mx2.privateemail.com`

Multiple TXT records coexist at the same name, so adding a Google verification
TXT does not disturb SPF, DMARC or MailerLite.

## 7. Automation activation order, with blast radius

With **"only add new subscribers"** selected, each of these enrols nobody today:

| Workflow | Trigger group | In group | Safe now? |
|---|---|---|---|
| Ultimate Onboarding | Ultimate Buyers | 0 | yes, no effect |
| Family Bundle Onboarding | Family Bundle Buyers | 0 | yes, no effect |
| Essentials Onboarding | Essentials Buyers | 1 | yes, existing buyer excluded |
| Review Request | All Customers | 1 | yes, existing customer excluded |
| Refund Handling | Refunded | 0 | only if a customer-facing refund email is wanted; the webhook already handles cleanup |
| Readiness Lead Nurture | Leads | 2 | **keep disabled** — superseded, would double-send |
| Buyer Onboarding (generic) | any tier | 2 | **keep disabled** — superseded, lacks refund exclusion |

Safe to activate is not the same as proven: these sequences have never run end to
end, and the webhook that populates their trigger groups is unverified (section 2).
