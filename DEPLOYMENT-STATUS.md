# flowgeniq payment service deployment status

Prepared November 4, 2026 (US Eastern).

- Private repository created and backend code committed.
- Catalog copied from the existing public storefront/admin API, without provider credentials.
- 30 automated tests passed. External providers and persistence are mocked in the tests; real sandbox purchases and deployed PostgreSQL verification are still pending.
- Render Blueprint passes the current public JSON Schema and Render's deployment preview.
- Target: MD's payment-only Render workspace, matching FaceDecode.
- Proposed resources: one Starter web service plus one Basic 256 MB PostgreSQL database, 1 GB, Oregon, external database access disabled.
- Deployment has not been submitted. It creates approximately $13/month base recurring infrastructure cost per brand, approximately $39/month total for all three, plus applicable usage/taxes.
- Initial runtime settings: PAYMENT_MODE=test, SHOP_ENABLED=false, CATALOG_APPROVED=false. New purchases remain paused.
- Next: approve the additional hosting cost, deploy, configure dedicated provider credentials and endpoint-specific webhook secrets, complete real sandbox verification, then integrate the storefront.
- FlowGenIQ live billing additionally requires authenticated account binding and verified subscription/credit entitlement integration with Suite Admin. Its live readiness gate is off until that is connected.
