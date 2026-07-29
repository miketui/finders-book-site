# Vendor and integration map

```text
Website visitor
    |
    +-- Free lead form
    |      -> /api/subscribe
    |      -> MailerLite Leads group
    |      -> MailerLite double opt-in
    |      -> Lead Nurture & Gap Check automation
    |
    +-- Paid checkout button
           -> Payhip product checkout
           -> Payhip receipt and paid-file delivery
           -> /api/payhip-webhook
           -> MailerLite buyer/refund groups
           -> MailerLite onboarding or suppression automation
```

## Source of truth by responsibility

| Responsibility | System |
|---|---|
| Public website and free PDF | GitHub + Vercel |
| Production secrets | Vercel Environment Variables |
| Paid product files and checkout | Payhip |
| Subscriber groups and email automations | MailerLite |
| Source control and change review | GitHub |

Zapier and Composio are not required in the live purchase path unless a separate, non-duplicative workflow is deliberately added later.
