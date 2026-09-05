# Operations runbook

What to watch, what to ignore, and what to do when something breaks. Written for
a low-volume serverless site with four API routes — deliberately proportionate:
Vercel's own logs and alerts plus this page, not an observability platform.

Last verified: 2026-09-05.

## Alerts worth acting on

| Signal | Where | Why it matters | First action |
|---|---|---|---|
| Any 5xx burst on `/api/*` | Vercel → Logs, filter status ≥ 500 | Purchases and leads are being dropped | Open the log line, read the `[payhip]` / `[gap-check]` / `[contact]` prefix |
| `unmapped_product` in webhook logs | Vercel logs, search `UNMAPPED` | A buyer paid and received no entitlement group | Compare the logged key against the product map in `api/payhip-webhook.js` |
| `502`/`503` from `/api/contact` | Vercel logs | Resend owner email is down, rejected, or `RESEND_CONTACT_API_KEY` is missing | Check `/api/health` → `behaviour.contact_owner_email` and `secrets_present.RESEND_CONTACT_API_KEY`. Secondary webhook failures do not 5xx the visitor |
| `502`/`503` from `/api/gap-check-subscribe` | Vercel logs | Missing `GAP_CHECK_TOKEN_SECRET`, or MailerLite is down **only if** `behaviour.gap_check_mailerlite_enabled` is true | Check `/api/health` for the Gap Check flag and MailerLite key; the default hold path does not call MailerLite |
| Sustained `429`/edge `403` on the public form routes | Vercel logs / Firewall | Either abuse or a genuine traffic spike | Inspect the active combined WAF rate-limit rule for `/api/contact` and `/api/gap-check-subscribe`; keep the in-process limiter as defense-in-depth |
| GA4 purchases stop while Payhip sales continue | GA4 vs Payhip dashboard | Revenue attribution is blind again | `/api/health` → `behaviour.ga4_purchase_reporting` |

Nothing else needs to page anyone.

## What is expected noise, not an outage

Seven days of runtime counts observed in the 2026-08-17 audit: 57 × 401,
18 × 405, 7 × 400, 1 × 403, 16 × 200, no 5xx cluster. Led by `/api/health` (57).

- **401 on `/api/health` and `/api/payhip-webhook`** — these routes are
  token-gated and publicly addressable. Unauthenticated probes are the normal
  background noise of the internet and mean the gate is working.
- **405** — wrong method against a route that only accepts one. Same story.
- **400 `malformed_json`** — a scanner posting junk.

Treat a *change in shape* as the signal: 401s from a single IP in the thousands,
or a 401 immediately after you rotated a token (that one is yours).

## The DEP0169 warning

Vercel records ~25 occurrences per 7 days of:

```
[DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized …
```

across `/api/gap-check-download`, `/api/payhip-webhook`, and `/api/health`.

**This is not application code.** No `url.parse()` call exists anywhere in this
repository (`grep -rn "url.parse" .`), and the routes it names have nothing in
common except that they are Vercel Node functions. It is the platform's own
request wrapper. It is a deprecation notice, not an error, not a vulnerability
with a call path in this codebase, and it does not affect responses.

Action: leave it. Re-check after Vercel bumps its Node runtime wrapper. Do not
"fix" it by suppressing Node warnings — that would hide real ones.

## Rollback

Every production deployment in Vercel is a rollback candidate.

1. Vercel → Project `finders-book-v34` → Deployments.
2. Find the last known-good production deployment (check `githubCommitSha`).
3. Instant Rollback.
4. Confirm `https://www.familyfindersbook.com/api/health?t=…` reports the
   expected `deployment.commit`.

Do not rely on a hard-coded SHA in this runbook. Record the currently promoted
production commit in the production-verification log before each launch change,
and choose the immediately preceding green production deployment if rollback is
needed.

Rolling back the site does **not** roll back MailerLite group membership. If a
bad webhook deploy mis-assigned groups, fix membership in MailerLite directly.

## Config verification after any env change

Vercel applies environment variables to *new* builds only. After editing one,
redeploy, then:

```text
https://www.familyfindersbook.com/api/health?t=YOUR_PRIVATE_TOKEN
```

It reports presence and behaviour flags only — never values, IDs, map contents,
signatures, or subscriber data.

Read `behaviour.ga4_purchase_reporting`, `behaviour.contact_owner_email`, and
`behaviour.contact_secondary_alert` to confirm revenue reporting, Resend owner
email, and optional secondary alerting are actually live. There is no
`contact_owner_alert` flag.

## Static asset caching posture

HTML/CSS/JS filenames are currently unversioned. Keep those mutable files on
revalidation rather than assigning a year-long immutable cache: a long cache on
an unversioned `styles.css` or `analytics.js` can strand a buyer on stale launch
logic after a deploy. Image/font assets may use long-lived caching where their
URLs are content-stable. If CSS/JS are later content-hashed, revisit this rule.

## Webhook token rotation, without downtime

1. Set `PAYHIP_WEBHOOK_TOKENS` to a JSON array holding **both** the old and new
   token: `["old-token","new-token"]`.
2. Redeploy. Both tokens now authenticate.
3. Update the webhook URL in Payhip to the new token.
4. Confirm a delivery succeeds (Payhip → webhook log, or a controlled purchase).
5. Reduce the array to the new token alone, or move it back to
   `PAYHIP_WEBHOOK_TOKEN`, and redeploy.

`/api/health` reports `webhook_token_mode` so you can tell which mode is live.

## Where revenue reporting can break

`api/payhip-webhook.js` sends GA4 `purchase` and `refund` through the
Measurement Protocol (`lib/ga4.js`). Known limits, by design:

- **It is off unless `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` are both set.**
  Silence is the default so previews and tests never write to the property.
- **Server events do not join the visitor's browser session.** Payhip does not
  forward the GA4 client id, so a purchase is attributed to a synthetic client
  derived from the transaction id. Campaign-level attribution therefore comes
  from the landing-page events and UTMs, not from the purchase event itself.
- **Successful Payhip replays are short-circuited in the webhook instance** by
  `type + transaction_id` for 24 hours, after all required work completes. Failed
  attempts are never marked processed, so Payhip can retry. The same
  `transaction_id` is still sent to GA4 as downstream duplicate protection. This
  is explicit same-instance replay protection, not a durable cross-instance
  transaction ledger.
- **A GA4 outage never fails a webhook.** The call is time-limited, its failure
  is logged, and the order still returns 200. This is deliberate: analytics must
  not make Payhip retry a delivery that already succeeded.

## What is published, and what is not

Every file uploaded to Vercel is served publicly. Until 2026-08-17 that included
`/tests/test-webhook.mjs`, `/scripts/check-secrets.mjs`, `/apply-chrome.py`,
`/docs/PRIVATE-PAYHIP-FILES.md`, `/areas/finders-book.md` and the CI workflow —
all 200 OK on the commercial domain. No secret values were exposed, but the
webhook signature scheme, the MailerLite group ids, the credential patterns
being scanned for, and the internal operational runbook were.

`.vercelignore` now excludes documentation and tooling, and
`scripts/check-deploy-surface.mjs` (part of `npm run validate`) fails the build
if a new development-only path appears without being excluded. When you add a
directory the site genuinely needs at runtime, add it to that script's `RUNTIME`
set rather than loosening the check.

### The lead magnet URL is deliberately not blocked

`/Family-Readiness-Gap-Check.pdf` is reachable without a token, and that is on
purpose: the MailerLite delivery email links straight to it, because the signed
token the form issues expires after 15 minutes — long before most people open an
email. Blocking the path would break delivery for every existing subscriber.

What it must never do is rank. `vercel.json` serves it with
`X-Robots-Tag: noindex, nofollow, noarchive`, because an indexed lead magnet is
one a search result hands out without an email address, and the Gap Check
signup rate is the metric the traffic plan gates growth on.

If you want it genuinely gated, that is a product change, not a config change:
the delivery email has to link to a long-lived, subscriber-scoped token instead
of the plain file.

## Support ownership

`/contact.html` promises "a person reads these". The production route emails the
owner through Resend (`RESEND_CONTACT_API_KEY`). It does **not** create or update
a MailerLite subscriber, so a support message cannot trigger marketing double
opt-in or the legacy Contact Acknowledgement workflow. `CONTACT_NOTIFY_WEBHOOK_URL`
is optional secondary alerting only. If owner email delivery fails, the visitor
sees the support-address fallback instead of a fake success.

Assign, in writing: who answers, and within how long. An unowned promise is the
failure mode here, not the code.

### Support retention review

The support/contact retention promise is operational, not aspirational. During the
**first week of January, April, July, and October**, the person responsible for
`info@familyfindersbook.com` must review the owner inbox (Resend / mailbox) first.
That mailbox is the system of record for contact-form copies. For each resolved
request, apply the numbered minimization steps to the mailbox copy before looking
anywhere else.

Then check the three Finder's Book Contact:* MailerLite groups. They are leftovers
from the old subscribe-on-contact path and should stay empty. Any profile there
was not created by the current site route — treat it as a leak to investigate,
then apply the same steps to that profile.

1. decide whether the message body is still needed for an active support issue,
   dispute, legal obligation, or necessary business record;
2. if it is no longer needed, remove or blank the stored contact-message text and
   other unnecessary support-only fields (mailbox copy first; MailerLite profile
   only if one exists);
3. preserve unsubscribe/suppression state and any record that must remain to honor
   an opt-out or legal obligation rather than re-subscribing someone by accident;
4. honor a valid deletion request by removing deletable profile/support data unless
   a documented legal obligation requires retention; and
5. record the review date in the private operating log so the next quarterly review
   is observable rather than assumed.

This procedure deliberately avoids promising a fixed deletion day in the public
policy. The governing rule is data minimization: once a resolved support message no
longer has an operational or legal reason to exist, its content should not remain in
the contact profile merely because storage is available.

## Runtime monitoring ownership

For the first four weeks after launch, the repository/account owner should review
Vercel function logs and production analytics/error signals at least weekly; after
that, monthly is sufficient while traffic remains low. Any repeated 5xx, failed
webhook, or customer-visible form failure reopens the relevant launch task.

A Node 24 `DEP0169` warning for legacy `url.parse()` has been observed on Vercel's
`/api/health` invocation and in GitHub runner setup. The repository itself contains
no `url.parse()` call. Treat this as an upstream runtime/tooling warning unless a
future stack trace identifies application-owned code. Do **not** suppress it.

**Sentry decision:** defer adding another error processor at the current launch
scale. GitHub's protected CI, Vercel runtime logs, owner alerting, and the existing
analytics stack provide the current operational floor. Revisit Sentry if uncaught
application exceptions appear, Vercel logs become insufficient to diagnose them,
or support volume makes manual correlation unreliable.
