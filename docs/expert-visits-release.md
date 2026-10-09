# Two consultation modes — 2026-10-09

## Implementation
- Expert visits reuse `private.urgent_requests` and `urgent_offers`. Branch visits retain `consultations.office_id`, date/time slots, existing approval/assignment and 60-minute duration. No duplicate mode column: visit workspace derives `consultationMode=expert_visit`; office_id identifies branch visits.
- Home and all six public situation guides link to both flows. `/urgent.html` supports anonymous discovery, device location or manual service-area selection. Authentication and verified phone are required to submit, not to browse.
- Search coordinates are separate from the actual meeting address. New requests do not persist search GPS. Customer chooses nearby or direct address, enters actual meeting address and a desired time within 15 minutes–4 hours. There is no existing saved-customer-place store; no saved addresses are invented.
- Customer selects one expert. Exactly one offer is inserted; no broadcast. Request key is idempotent and cannot be reused for a different expert. Offer acceptance reserves the expert, then customer confirmation explicitly releases address/contact/notes. Existing state codes remain; confirmed_at/rejected_at distinguish confirmation and rejection.
- Expert GPS stays in private.instant_availability. `visit_catalog` returns only approved public profile fields, rounded distance, straight-line ETA range, freshness and genuine verification booleans. No GPS, contact or movement history. Public planner map continues using reference activity-area centroids.
- Availability requires fresh `expert-visit-v1` opt-in; old ON values do not silently opt in. Default OFF, 1/2/4-hour choices (default4). Foreground state checks and explicit manual GPS refresh; no background tracking. Refresh does not extend the selected expiry. OFF clears GPS and does not cancel accepted/confirmed requests.
- Server config: fresh10min, stale10–30min, excluded>=30min, radius30km. Eligibility reuses live approval and verified-contact rules. Requests and acceptance recheck availability. Acceptance and office booking share the existing expert advisory lock and reject overlapping appointments.
- Map: house/square = office; person/circle = expert activity area; dashed house = planned office. Office filter keeps branch booking; expert cards no longer suggest the reference centroid is a visit address. Planned offices have no slots; inactive offices remain omitted by existing catalog rules.

## Migration / rollback
- `supabase/046_expert_visits.sql`: single transaction + advisory lock, rerunnable. Four nullable urgent request columns and one availability consent-version column; private function-definition backup table with RLS and no client grants. No member/profile deletion, column drop, type conversion or existing record backfill.
- Existing eligibility, phone bridge, RLS, Storage, member records, expert review and branch consultation functions remain in place. Existing urgent and planner functions are retained as non-client-callable delegates.
- Booking policy remains governed by the existing DB `require_booking_access` and service_features; no competing environment flag added.
- `supabase/rollback_expert_visits.sql` restores captured function definitions and revokes new public catalog access only if no new-format requests exist. Additive columns/consents are retained. If new requests exist it intentionally refuses the old address-disclosure behavior; fix forward while keeping privacy checks. UI changes can be reverted and rebuilt, but do not restore the old broadcast UI while new requests need customer confirmation.

## Verification
- `node --test tests/expert-visits.test.mjs`: four DB scenarios PASS: one offer, replay, cross-user restrictions, private addresses until confirmation, explicit confirm consent, progress completion; no raw GPS; freshness/expiry/defaultOFF/consent/manualrefresh/rejection; branch60min/18:00/plannedblock/duplicateblock; cross-mode collision and guarded rollback.
- `node --test tests/operational-policy.test.mjs`: two existing policy/booking regression scenarios PASS.
- `node tests/expert-visits-browser.mjs`: actual local SQL behind browser UI PASS: anonymous discovery, opt-in, one-expert request, acceptance/confirmation/privacy, arrival/completion, guide links, 320/390/768/1440 widths. GPS and users are isolated fixtures, not production users.
- `node tests/visit-map-icons-browser.mjs`: icons, public-area copy, office booking retained, filters and four widths PASS. Tile requests disabled in test images.
- Production read-only preflight: urgent command, slot checker, verified-contact bridge present; urgent requests0, consultations0, enabled availability0. Does not prove real expert GPS or a real customer visit.
- No actual user was opted into location, no SMS sent, no synthetic production appointment created.
- Screenshots: artifacts/visit-map-icons-mobile.png, expert-visits-list-mobile.png, expert-visits-request-mobile.png.
- Action-time approval received (option 1). Production SQL 046 executed successfully. Production website deployment and public verification in progress.
