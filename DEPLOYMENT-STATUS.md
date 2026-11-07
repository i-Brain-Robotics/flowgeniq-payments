# Payment readiness — 2026-11-07 UTC

## Verified current state

| Site | Normal dedicated checkout | Stripe verification | PayPal verification |
| --- | --- | --- | --- |
| FaceDecode | Enabled: Stripe and PayPal; delivery/state, installation and Florida tax reviewed before consent | Live $0 order completed | Live $0.10 order created; merchant-as-buyer blocked approval |
| BodyDecode | Enabled: Stripe and PayPal | Live $0 order completed; signed webhook recorded | Live $0.10 order created; merchant-as-buyer blocked approval |
| AugmentEYE | Enabled: Stripe and PayPal; full basket preserved | Live $0 order completed; signed webhook recorded | Live $0.10 order created; merchant-as-buyer blocked approval |
| FlowMedIQ | Enabled: Stripe and PayPal; existing team-managed onboarding | Live $0 order completed; signed webhook recorded | Live $0.10 order created; merchant-as-buyer blocked approval |
| FlowGenIQ | PAUSED: account/credit entitlement integration and incomplete policies | Live $0 order completed; signed webhook recorded | Live $0.10 order created; merchant-as-buyer blocked approval |

No paid card checkout or PayPal capture is claimed. No charge was collected in these verification attempts. Free-order success proves the free checkout path, not a paid transaction or subscription renewal.

## Repairs applied

- Deployed the BodyDecode, AugmentEYE, FlowGenIQ and FlowMedIQ backend changes that preserve storefront payment-method selections and expose safe readiness fields.
- Connected the original FaceDecode, BodyDecode, AugmentEYE and FlowMedIQ storefronts to their isolated payment services. Provider credentials stay on those services.
- Corrected Stripe webhook destinations for FaceDecode and AugmentEYE from the service homepage to `/payments/webhooks/stripe`, preserving the existing endpoints and signing secrets.
- Corrected PayPal webhook destinations for FaceDecode, BodyDecode and AugmentEYE from the service homepage to `/payments/webhooks/paypal`, preserving the existing webhook IDs.
- All five services authenticated successfully with live Stripe and PayPal credentials. Stripe reported charges enabled. All five Stripe destinations have the three checkout-session events enabled. PayPal destinations have the subscription, sale and capture events needed by the existing implementation.
- Restored the seller's specified FaceDecode policy sections in its versioned admin settings.
- Enabled reviewed BodyDecode and AugmentEYE catalogs. Published AugmentEYE's existing defective-item replacement terms in the previously empty coverage section.
- Enabled FlowMedIQ's existing team-managed onboarding workflow and approved catalog. Its storefront explicitly states that payment does not automatically activate applications.
- Fixed FaceDecode's missing shipping, installation and Florida-tax calculation. Delivery is chosen before final consent. Signed references bind the final amount and US state; merchant metadata retains the installation choice. Existing fd1/fd2/fd3 payment references remain supported. All 57 FaceDecode backend tests passed.

## Remaining work

1. Complete the five $0.10 PayPal purchases with a buyer account separate from the merchant account; verify capture and provider-signed webhook reconciliation. Current PayPal session belongs to the merchant, so PayPal returns CANNOT_PAY_SELF.
2. Implement authenticated account binding and replay-safe plan/credit allocation and renewal reconciliation between FlowGenIQ payments and Suite Admin. Complete its missing delivery/access, refund and coverage policies. Keep FLOWGENIQ_ENTITLEMENTS_READY and normal catalog approval off until this is tested. A verification order must never grant software or credits.
3. Perform paid subscription and cancellation/renewal acceptance tests before claiming full recurring-billing validation. Legacy subscriptions continue on their existing reconciliation paths.

## Destinations

For each brand payment-service origin `https://BRAND-payments.onrender.com`, Stripe uses `/payments/webhooks/stripe` and PayPal uses `/payments/webhooks/paypal`.

FlowGenIQ storefront origin is `https://suite.flowgeniq.io`; its plans page is `/suite/plans`. The storefront-origin setting should contain only the HTTPS origin.
