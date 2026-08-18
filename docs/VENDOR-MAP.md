# Vendor and integration map

```text
Website visitor
    |
    +-- Free lead form
    |      -> /api/gap-check-subscribe
    |      -> MailerLite Leads group
    |      -> MailerLite double opt-in
    |      -> signed /api/gap-check-download link
    |      -> MailerLite Gap Check Lead Nurture after confirmation
    |         (provider-managed; re-verify live eligibility/suppression before paid launch)
    |
    +-- Paid checkout button
           -> Payhip product checkout
           -> Payhip receipt and paid-file delivery
           -> /api/payhip-webhook
           -> All Customers + matching buyer group
           -> remove Leads / Refunded on purchase
           -> item-scoped refund suppression and buyer-group cleanup
           -> MailerLite onboarding/review automation when approved
```

## Source of truth by responsibility

| Responsibility | System |
|---|---|
| Public website and free PDF | GitHub + Vercel |
| Production secrets | Vercel Environment Variables |
| Paid product files and checkout | Payhip |
| Subscriber groups and email automations | MailerLite |
| Purchase/refund lifecycle mapping | Vercel `/api/payhip-webhook` |
| Measurement | GA4 + Vercel Web Analytics |
| Source control and change review | GitHub |

Zapier and Composio are not runtime dependencies in the live purchase path.

**Operator tooling:** Composio is intentionally used as a maintenance/launch
bridge for authorized reads and scoped changes in GitHub, Vercel, GA4,
MailerLite, and Payhip when those connectors are available. Its failure must not
break checkout, fulfillment, forms, or email delivery. Keep each connector at
the least privilege needed for the active maintenance task, and never create a
second Payhip→MailerLite lifecycle path through Composio or Zapier.
