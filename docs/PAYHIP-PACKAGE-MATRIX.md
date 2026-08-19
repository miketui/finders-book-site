# Payhip package matrix — verified 2026-08-18

This document records current launch evidence for the three live Finder’s Book Payhip products. It intentionally contains no customer email addresses, payment credentials, webhook secrets, or private account identifiers.

## Live store/account settings verified

- Google Analytics measurement ID: `G-ZXX0M4VYT5`
- Global download-attempt limit: `5`
- PDF buyer-email stamping: off
- Checkout post-purchase redirect: off
- Collect customer first and last name: on
- Digital-product gifting: on
- Custom checkout questions: off
- Receipt subject: `Thank you for your purchase!`
- Custom receipt message: blank
- All three products are visible
- All three products currently auto-subscribe purchasers to `Finder’s Book — All Customers`

## Live products and exact attached ZIPs

| Product | Price | Exact Payhip ZIP | Observed bytes | Payhip UI size |
|---|---:|---|---:|---:|
| Essentials Digital Edition | $29 | `The_Finders_Book_Essentials_v1.0_PAYHIP_READY_FINAL.zip` | 28,876,111 | 27.5 MB |
| Ultimate Digital Edition | $49 | `The_Finders_Book_Ultimate_v1.2.3_PAYHIP_READY_FINAL.zip` | 27,206,126 | 25.9 MB |
| Family Bundle (3-Household License) | $89 | `The_Finders_Book_Family_Bundle_v1.0_PAYHIP_READY_FINAL.zip` | 28,145,047 | 26.8 MB |

The byte sizes above match the currently attached Payhip files shown in the product editors after normal binary-to-MiB display rounding.

## Delivered package matrix (physical files and buyer entitlements)

| Delivered file / entitlement | Essentials | Ultimate | Family | Expected | Observed |
|---|:---:|:---:|:---:|---|---|
| 49-page fillable core PDF | ✅ | ✅ | ✅ | all tiers | PASS |
| 49-page printable core PDF | ✅ | ✅ | ✅ | all tiers | PASS |
| Essentials Start Here | ✅ | — | — | Essentials only | PASS |
| Ultimate/Family Start Here | — | ✅ | ✅ | Ultimate + Family | PASS |
| Emergency Fridge Card | — | ✅ | ✅ | Ultimate + Family | PASS |
| 15-Minute Secure Vault Setup Guide | — | ✅ | ✅ | Ultimate + Family | PASS |
| Continuity Check-In Plan | — | ✅ | ✅ | Ultimate + Family | PASS |
| Trusted Person Handoff Scripts | — | ✅ | ✅ | Ultimate + Family | PASS |
| Digital Legacy Link + QR Guide | — | ✅ | ✅ | Ultimate + Family | PASS |
| Consumer/personal-use license | ✅ | ✅ | — | Essentials + Ultimate | PASS |
| Family Coordination Guide | — | — | ✅ | Family only | PASS |
| Three-Household License | — | — | ✅ | Family only | PASS |
| SHA256SUMS | ✅ | ✅ | ✅ | all tiers | PASS |
| README_FIRST.txt | ✅ | ✅ | ✅ | all tiers | PASS |
| README_FIRST_FAMILY_BUNDLE.txt | — | — | ✅ | Family only | PASS |

All supplied `SHA256SUMS.txt` entries verified successfully against the materialized ZIP contents.

## Edition integrity / C07 conclusion

**Essentials is genuinely reduced; keep the $29 tier visible.**

The Essentials and Ultimate books intentionally share a 49-page core structure, but the Essentials core removes or rewrites Ultimate-only bonus references. Verified examples include pages 8, 13, 16, and 41. No Ultimate bonus PDF is present in the Essentials ZIP.

Physical ZIP file counts (directories excluded; every file entry counted, including README/license/checksum files):

- Essentials: 6 physical files
- Ultimate: 11 physical files
- Family: 13 physical files

Ultimate adds five implementation tools. Family adds the Family Coordination Guide plus the three-household license. The older concern that Essentials might simply be the same product sold twice is therefore closed.

## License and support truth

- Essentials and Ultimate are licensed for personal/private household use under their consumer terms.
- Family explicitly licenses use across up to three private households total.
- Family license prohibits redistribution, resale, public upload, and professional/client-use redistribution.
- Package READMEs/licenses point customers to `info@familyfindersbook.com` for support.
- The product/package copy references the Finder’s Book Payhip refund-policy page.

## Controlled Ultimate customer-journey evidence

A real discounted payment was completed against the live $49 Ultimate product and then fully refunded.

Verified outcomes:

- website → Payhip checkout succeeded
- real card payment succeeded
- correct Ultimate download was accessible
- Ultimate buyer routing fired
- initial Ultimate onboarding email delivered
- refund propagated into the Finder’s Book refund workflow
- buyer entered `Refunded` and left `Ultimate Buyers`
- GA4 Realtime recorded exactly one `purchase` and exactly one `refund`
- a separate valid Essentials entitlement correctly preserved `All Customers`

One defect remains outside the Payhip package itself: MailerLite continues to show the refunded test subscriber as queued inside the already-running Ultimate onboarding sequence. Track that under the MailerLite/refund-suppression launch gate rather than treating it as a Payhip fulfillment failure.

## C06 refund-policy verification — closed 2026-08-18

The owner supplied the exact current text from the canonical public refund-policy page at `https://www.familyfindersbook.com/refund-policy.html`. The policy states:

- full refunds are available for files that cannot be downloaded/opened after support attempts, corrupted/incomplete/materially misdescribed files, duplicate charges, and unauthorized orders;
- those covered refund requests must be made within **30 days** of purchase;
- routine change-of-mind refunds are not offered once the digital download has been accessed;
- UK/EU customers retain the normal 14-day cancellation right only while the files have not yet been downloaded, with immediate digital supply acknowledged at checkout;
- approved refunds return to the original payment method, with a stated typical bank-posting window of 5–10 business days; and
- a refund ends the customer’s licence to use the refunded files.

This closes the final C06 documentation gap. Combined with the direct Payhip dashboard evidence, canonical-package checksum verification, customer-forwarded Essentials/Family hash matches, and the controlled Ultimate purchase/download/refund journey, C06 is now fully verified.

## Customer-forwarded download verification — 2026-08-18

Two ZIP files forwarded from the actual Payhip customer download path were compared against the canonical packages used for this audit. The customer-forwarded copies are exact byte-for-byte matches; the local `(1)` suffix is only the device duplicate-download filename and is not part of the archive content.

| Tier | Customer-forwarded bytes | SHA-256 | Canonical match | Internal checksums |
|---|---:|---|---|---|
| Essentials | 28,876,111 | `a62f80eecd2ea2297be1473dfbabddd1cf799c8420cd9e84f9ccc819845e7ff9` | exact | all 5 listed entries PASS |
| Family | 28,145,047 | `caa9990772ec7396eb6a8fe0f1dd559e44d12f001a9eb130b25f66bea5022361` | exact | all 12 listed entries PASS |

This upgrades C06 evidence from “dashboard filename/size plus canonical package inspection” to direct proof that the **Essentials and Family files actually delivered to a customer are the same vetted archives**. Ultimate delivery was separately exercised through the controlled paid QA journey. The final C06 refund-policy wording/window gap is closed by the owner-supplied canonical public policy text recorded above.

