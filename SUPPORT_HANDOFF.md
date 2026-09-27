# Rule-based customer support — local test handoff

Implemented on the existing private test app, without public deployment or real accounts/payments.

- `src/test-flow/support.js`: FAQ/keyword widget, situation routing, consented inquiry submission, customer reply polling, admin inbox and FAQ CRUD.
- `src/test-flow/support-rules.mjs`: deterministic classification only; no AI or insurance judgment.
- `supabase/013_private_support.sql`: persistent FAQ/inquiry tables, owner isolation, admin-only writes, revisions, idempotency and audit events. Browser roles have no direct RPC/table grants.
- `src/test-flow/database.mjs`, `scripts/test-flow.mjs`: support RPC adapter and local API allowlist.
- `src/test-flow/ui.js`, `public/test-flow.css`: widget integration and responsive styling; existing map/signup/booking preserved.

Validation: production build; tests/support.test.mjs (authorization, privacy, duplicate requests, replies, stale revisions, FAQ CRUD); tests/support-browser.mjs (360px widget, FAQ, situation to map, inquiry to admin, manual reply to customer, FAQ creation, Escape, no JS errors).

Limitations: current persistence is local PGlite/PostgreSQL. A separate remote Supabase test project is not connected and migration 013 has not been applied remotely. Dummy role switching is not production authentication. No SMS, push, email delivery or AI. Replies appear when customer opens chat (2-second polling). Only submitted inquiries persist; unsent chat keywords stay in memory. Use dummy content only. No deployment was performed.
