# flowgeniq payment service deployment status

Deployed and verified November 4, 2026 (US Eastern).

## Deployment

- Public service: https://flowgeniq-payments.onrender.com
- Render dashboard: https://dashboard.render.com/web/srv-dbm06te1egvs73ath7l0
- Service ID: srv-dbm06te1egvs73ath7l0
- Blueprint ID: exs-dblvus5bedkc73apgrng
- Successful deploy: dep-dbm06tm1egvs73ath8d0
- Deployed runtime commit: 1b1683f78201cd87874a5d00f5887ee106aedf1c
- Render reports the deployment LIVE.
- Dedicated PostgreSQL database: flowgeniq-payments-db; Basic 256 MB, 1 GB storage, Oregon, public database access disabled.
- Web compute: Starter, Oregon. Automatic web deployments remain off.
- Hosting cost approved by the owner: approximately $13/month per service/database pair, $39/month total for all three, plus applicable usage/taxes.

## Verified against the deployed service

- GET /healthz returned HTTP 200, status ok, PAYMENT_MODE=test.
- GET /readyz returned HTTP 200, confirming PostgreSQL connection and initialization.
- GET /api/shop returned HTTP 200, the correct brand catalog, paymentMode=test, ready=false, providers=[].
- GET /checkout returned HTTP 503 as expected while new purchases are paused.
- Startup database connection refusals resolved during provisioning before the successful deployment; subsequent database health probes passed.
- The original 30 automated backend tests passed per repository (90 total across all three). Provider calls and persistence in automated tests are mocked; no real provider sandbox purchase has been completed for these services.
- Existing storefronts and customer subscriptions have not been migrated.

## Runtime state and remaining setup

PAYMENT_MODE=test, SHOP_ENABLED=false, CATALOG_APPROVED=false. Each service uses its own generated checkout signing secret and its own database. No Stripe or PayPal credentials or endpoint webhook secrets were copied from another service.

Before accepting payments: configure the intended brand-specific provider credentials and new webhook endpoints; complete real sandbox success, decline, cancellation, retry and duplicate-webhook checks; review purchase policies and current catalog; configure a unique admin login if needed; then integrate the storefront and reconcile legacy transactions.

FlowGenIQ additionally requires authenticated customer/account binding and tested subscription/credit entitlement integration with Suite Admin. Its live-readiness gate stays off until that is connected.

Webhook URLs:
- https://flowgeniq-payments.onrender.com/payments/webhooks/stripe
- https://flowgeniq-payments.onrender.com/payments/webhooks/paypal

See README.md for the full activation and migration workflow. The service being LIVE on Render means its infrastructure is running; it does not mean live payment processing is enabled.


## Verification-product change prepared — November 5, 2026

$0 Stripe free-order and $0.10 PayPal products are prepared. Local verification across all five payment repositories passes 212 automated tests (FaceDecode 55; BodyDecode 38; AugmentEYE 38; FlowGenIQ 38; FlowMedIQ 43). These are mocked provider/HTTP tests. This revision still needs deployment, live provider validation, signed webhook delivery and buyer completion. No live verification order or charge has been completed.
