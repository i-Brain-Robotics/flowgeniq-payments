# FlowGenIQ payment verification — November 5, 2026

## Current deployment

- Payment origin: https://flowgeniq-payments.onrender.com
- Render service: `srv-dbm06te1egvs73ath7l0` in the separate payment-services workspace.
- Storefront verification entry: https://flowgeniq-payments.onrender.com/shop
- Latest checkout-code revision before this status update: `b70030a5346742d6adece466404bc22c6e81d598`.
- Live HTTP checks: `/healthz`, `/readyz` and `/api/shop` respond successfully; payment mode is `live`.
- Regular private-service catalog readiness is `false`. Verification readiness is evaluated separately for the two fixed test products. Existing embedded storefront payment flows and legacy subscriptions have not been migrated by this change.
- The Blueprint restores manual web deployment (`autoDeployTrigger: "off"`) after the fix rollout. Runtime configuration in the private workspace requires an authenticated owner to inspect; source configuration is not evidence of a Dashboard setting.

## Actual provider results

| Service | Stripe $0 free order | PayPal $0.10 order |
| --- | --- | --- |
| FaceDecode | Completed in live checkout; return says “Free checkout completed.” | Live order created; guest checkout displays $0.10; buyer completion pending. |
| BodyDecode | Blocked: Stripe key matches live mode, but webhook secret check fails. | Live order created; guest checkout displays $0.10; buyer completion pending. |
| AugmentEYE | Completed in live checkout; return says “Free checkout completed.” | Live order created; guest checkout displays $0.10; buyer completion pending. |
| FlowGenIQ | Blocked: live Stripe key/webhook checks fail. | Blocked: PayPal credential/webhook checks fail. |
| FlowMedIQ | Blocked: live Stripe key/webhook checks fail. | Blocked: PayPal credential/webhook checks fail. |

No PayPal order was captured and no paid card charge or subscription was created. The two successful Stripe orders are no-cost order checks; they do not verify paid card authorization or capture. Live webhook delivery has not been independently audited: the merchant Stripe Dashboard requires sign-in. Successful return-page verification does not establish webhook delivery.

PayPal guest checkout is available on FaceDecode, BodyDecode and AugmentEYE. The optional create-account selection was unchecked. Buyer name, phone and payment details must be completed by the owner; no customer or payment data is stored in this report.

## Products and scope

- `checkout-test-free`: $0.00 USD, Stripe only, one-time free verification order.
- `checkout-test-paypal`: $0.10 USD, PayPal only, one-time verification order.
- Neither product provides equipment, software access, credits, fulfillment or a recurring subscription. Verification uses its own purchase terms, fixed prices and signed references.
- The original FaceDecode, BodyDecode, AugmentEYE and FlowMedIQ storefronts have deployed verification cards. Cards are shown only when the matching backend reports live verification readiness for that provider. FlowGenIQ verification uses its standalone payment storefront; Suite and SuiteAdmin were not modified.
- `PAYMENT_VERIFICATION_ENABLED=false` removes temporary items after completion. Normal provider/catalog/onboarding gates are preserved.

## Remaining work

1. In **bodydecode-payments**, configure the live Stripe endpoint signing secret (`STRIPE_WEBHOOK_SECRET`) for `https://bodydecode-payments.onrender.com/payments/webhooks/stripe`. The current redacted readiness check fails; the live key check passes.
2. In **flowgeniq-payments** and **flowmediq-payments**, configure valid live `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID`. Current checks fail for both provider pairs; they do not reveal secret values or prove which individual value is absent. Modes are already live.
3. Register each provider destination against its matching payment origin, including `/payments/webhooks/stripe` and `/payments/webhooks/paypal`, and set that destination's matching secret/ID. Values on the original website app do not configure the separate payment app.
4. Complete the three open $0.10 PayPal guest checkouts with owner-provided buyer/payment details, then verify capture, signed return and provider webhook delivery. Sign in to the payment-services Render account and merchant dashboards for the remaining configuration/audit.
5. Complete Stripe free checkout on the remaining services once ready. A paid USD Stripe card test requires at least $0.50, above the currently authorized $0.10 test amount; none was attempted. Reference: https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts
6. Confirm regular purchase policies, normal product/provider enablement, entitlement/onboarding integration where applicable, subscription behavior and legacy transaction reconciliation before claiming the full storefront/payment flow is ready. Existing gates must not be bypassed for testing.

## Code validation and fixes

All five backends pass **228 automated tests**: FaceDecode 55, BodyDecode 42, AugmentEYE 42, FlowGenIQ 42 and FlowMedIQ 47; this repository contributes 42. These tests use deterministic provider fixtures and do not replace real payments or webhooks. All five Blueprints validate; the four original storefront builds are Live after strict TypeScript checks.

Live testing exposed and fixed JSONB object-key reordering during retry comparison; null subscription access on one-time Stripe confirmation; incorrect free-order classification; and blank physical shipping fields on digital PayPal orders. Regression tests model these cases. Verification consent is bound to its own terms, unavailable providers are hidden per product, and provider error diagnostics expose only sanitized HTTP status/enum codes. No provider credentials were copied into Git.
