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

## 2. Payhip webhook and Family purchase are proven

A fresh controlled Family Bundle order completed successfully on 2026-08-15.

| Check | Verified result |
|---|---|
| Payhip checkout | $89 subtotal, -$89 QA discount, $0 total |
| Payhip order ledger | Family Bundle increased to 2 orders; new $0.00 Free transaction shown |
| Delivery page | Download page email reported sent to the controlled Family test inbox |
| Vercel webhook | `POST /api/payhip-webhook` returned 200 |
| Routing log | `[payhip] paid -> family_bundle` |
| MailerLite subscriber | active; source `api` |
| Correct groups | Family Bundle Buyers and All Customers only |
| Incorrect groups | none: Leads, Refunded, Essentials, Ultimate, Review Requested absent |

This supersedes the earlier “no observed successful delivery” finding. The
Payhip -> Vercel -> MailerLite Family purchase path is now proven end to end.
The connected Gmail inbox was not the controlled purchase inbox, so Payhip's
sent confirmation is recorded without claiming independent inbox receipt.

## 3. Controlled Family subscriber state

The controlled Family test subscriber was verified immediately after the order:

| Property | Result |
|---|---|
| Status | active |
| Source | API |
| Family Bundle Buyers | present |
| All Customers | present |
| Leads | absent |
| Refunded | absent |
| Essentials Buyers | absent |
| Ultimate Buyers | absent |
| Review Requested | absent |

This is the required exact segmentation result for the Family purchase QA gate.

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

## 7. Automation activation and Step 9 state

Family Bundle Onboarding and Review Request were dry-simulated with no warnings,
then activated in the MailerLite dashboard with **No, only add new subscribers**.
Both were renamed to remove their draft/do-not-enable labels.

| Workflow | State after verification | In progress |
|---|---|---:|
| Family Bundle Onboarding | active; new subscribers only | 0 |
| Review Request | active; new subscribers only | 0 |
| Essentials Onboarding | active | 0 |
| Ultimate Onboarding | active | 0 |
| Gap Check Lead Nurture | active | 0 |
| Contact Acknowledgement | active | 0 |
| Buyer Onboarding | inactive; keep off | 0 |
| Readiness Lead Nurture | inactive; superseded | 0 |
| Refund Handling | inactive | 0 |

Payhip support-address corrections were publicly reverified across all three
product descriptions and both refund-policy references. After explicit approval,
all five owner-only 100% QA coupons were permanently deleted. Payhip displayed
`Coupons 0` and `0 coupons added`.

Step 8's Family gate is PASS. Step 9 may proceed as a controlled soft launch,
with order totals, webhook 200 responses, Payhip delivery, and MailerLite group
membership monitored for every early order.
