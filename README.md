# FlowGenIQ payments

Current verification status (November 5, 2026): temporary $0 Stripe and $0.10 PayPal items are implemented. Live testing is partial; see [DEPLOYMENT-STATUS.md](DEPLOYMENT-STATUS.md) for completed checkouts, provider configuration blockers and required buyer handoffs. Older deployment descriptions below describe the initial rollout.

Private, independently deployed payment backend, following the FaceDecode isolation model. Node 24, dedicated PostgreSQL database, independent signing secret and provider webhook configuration. New purchases start paused in test mode. Source catalog captured from the existing storefront/admin public API on November 4, 2026 (US Eastern).

## Billing

Server-owned catalog.json defines products, amounts, monthly fees and delivery charges. Client amounts and unknown fields are rejected. BodyDecode supports one portrait screen and mutually exclusive monthly plans. AugmentEYE supports complete units and accessories without recurring charges. FlowGenIQ filters its own subscription plans and supports one-time credit packs; FlowMedIQ plans are excluded.

Stripe hosted card checkout handles one-time, subscription-only, and device-plus-subscription orders. PayPal uses Orders for one-time purchases and Subscriptions for recurring purchases. A mixed PayPal purchase uses a one-time setup fee plus a monthly plan. Provider approval is not sufficient proof of payment: all return routes and webhooks verify exact order, amount, currency, mode, line items and subscription before recording paid status. Signed references, HTTP-only same-origin checkout cookies, CSRF checks, price revalidation, provider URL allowlists, database locks and provider idempotency keys protect checkout. Verified webhook event IDs are unique in the database. Customer address details remain in the private payment database.

Affirm is implemented for eligible one-time physical orders through Stripe. It requires explicit AFFIRM_MERCHANT_APPROVED=true and ENABLED_PROVIDERS=stripe,paypal,affirm; US/USD $35–$30,000 only. It is excluded for monthly subscriptions and BodyDecode hardware above the limit. PayPal Advanced Cards are not implemented in this service.

## Deploy

render.yaml provisions a Starter web service and Basic 256 MB PostgreSQL database with 1 GB storage, Oregon, database public access disabled, automatic deploys off. Build: npm ci --omit=dev && npm test. Start: npm start. Health: /readyz checks the database; /healthz checks the process. /api/shop returns public catalog and checkout readiness. /admin is an authenticated read-only configuration status endpoint; configure ADMIN_USERNAME and a unique scrypt ADMIN_PASSWORD_HASH using npm run admin:password. Catalog edits are reviewed code changes; provider secrets belong only in Render or a brand-specific Doppler config.

1. Apply the Blueprint in the same payment-only Render account as FaceDecode.
2. Add brand-specific sandbox credentials. Never copy signing secrets, database URLs or endpoint-specific webhook secrets from another service.
3. Register Stripe webhook https://flowgeniq-payments.onrender.com/payments/webhooks/stripe for checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed. API version 2025-02-24.acacia. Register PayPal /payments/webhooks/paypal for CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED/PENDING/DENIED/REFUNDED/REVERSED, BILLING.SUBSCRIPTION.CREATED/ACTIVATED/CANCELLED/SUSPENDED/EXPIRED/PAYMENT.FAILED and PAYMENT.SALE.COMPLETED/REFUNDED/REVERSED.
4. Enable SHOP_ENABLED=true in test mode and verify real sandbox payment success, decline, cancellation, retry and duplicate webhook delivery. Automated provider tests use mocks and are not sandbox purchases.
5. Review current catalog, tax/shipping, policies and merchant eligibility, then set CATALOG_APPROVED=true. Live checkout additionally requires complete policies. Update PAYMENT_MODE and PAYPAL_MODE consistently in the authoritative configuration, including render.yaml before a later Blueprint sync.
6. FlowGenIQ requires a verified authenticated customer binding, renewal/credit entitlement integration with Suite Admin, and FLOWGENIQ_ENTITLEMENTS_READY=true before live checkout. Current order records alone do not provision accounts, credits, or software access. Keep existing Suite billing paths until that integration is tested.
7. Only after sandbox verification, integrate the storefront by reading /api/shop and linking to the fixed payment origin's /checkout?sku=PRODUCT_ID. Physical orders collect country/state/install choices before final consent; never forward payment credentials or storefront cookies. Existing transactions and subscriptions must remain on their original reconciliation paths until resolved.

## Verification and limits

Run npm ci && npm test. Use a dedicated development PostgreSQL database for real persistence checks. No credentials are committed. Refunds, fulfillment, subscription management and automatic software/credit provisioning are not implemented. Renewal events do not grant entitlements. Prices are a versioned snapshot, so review future changes in both systems before release. Catalog policies may be incomplete; live readiness is blocked until completed. The deployment does not change the existing storefront or migrate existing customer subscriptions.


## Temporary checkout verification products (November 5, 2026)

New verification products use the existing provider checkout, signed-reference, return, and webhook paths. `PAYMENT_VERIFICATION_ENABLED=true` enables only these items while normal sales remain subject to their existing approval and readiness checks. This flag can be set false to remove them after testing.

- `checkout-test-free`: $0.00 USD, one-time Stripe no-cost order. Successful completion is recorded as `free`, not a paid card transaction. Stripe collects no payment method.
- `checkout-test-paypal`: $0.10 USD, one-time PayPal order and capture. This is a real payment in live mode; no subscription or delivery address is required.
- Both items include no equipment, software access, credits, subscription, or automatic entitlement.
- Stripe's minimum non-zero USD card charge is $0.50. No paid Stripe verification is authorized or performed by this change.
- Unit/HTTP tests cover exact prices, supported providers, consent, signed references, free completion, PayPal capture and webhook reconciliation. They do not prove live authentication, buyer approval, delivery, or a completed live transaction.

The Blueprint sets `PAYMENT_MODE=live` and `PAYPAL_MODE=live` for the requested live verification. It preserves Dashboard-managed normal shop enablement, catalog/onboarding approval and enabled-provider lists. `PAYMENT_VERIFICATION_REVISION` rolls out this verification update without enabling normal sales. Credentials and provider webhook registration are still required; no credentials are copied into this repository.

The separate payment-services Render account is needed for manual deployment. Frontend verification cards appear only after the matching backend reports live-mode verification readiness. Current original storefront checkout flows and legacy subscriptions remain in place.

The Blueprint is restored to `autoDeployTrigger: "off"` after the checkout-fix rollout. Live testing fixed JSONB address ordering on retries, one-time Stripe confirmation when subscription is null, and digital PayPal requests containing empty shipping fields. Verification items use their own purchase terms and provider-specific readiness. Zero-total Stripe orders are classified as free whether Stripe reports `paid` or `no_payment_required`. See `DEPLOYMENT-STATUS.md` for the actual live results and remaining configuration.
