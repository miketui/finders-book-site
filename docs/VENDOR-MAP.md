# Vendor and integration map

```text
Website visitor
    |
    +-- Free lead form
    |      -> /api/gap-check-subscribe
    |      -> MailerLite Leads group
    |      -> MailerLite double opt-in
    |      -> signed /api/gap-check-download link
    |      -> Gap Check Lead Nurture after confirmation
    |
    +-- Paid checkout button
           -> Payhip product checkout
           -> Payhip receipt and paid-file delivery
           -> /api/payhip-webhook
           -> All Customers + matching buyer group
           -> remove Leads / Refunded on purchase
           -> refund suppression and buyer-group cleanup
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

Zapier and Composio are not required in the live purchase path unless a separate, non-duplicative workflow is deliberately added later.
