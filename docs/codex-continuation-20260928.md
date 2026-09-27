# 2026-09-28 continuation
Read docs/claude-to-codex-handoff.md (4707d18 baseline). Preserved current home copy/layout and Claude's wheel/touch map changes.

Local signup Google button now opens the existing live signup page after consent. Read-only verification returned live config enabled=true, Google provider enabled=true, and OAuth authorize HTTP302 to accounts.google.com. No Google account was created, no session completion was verified, and local dummy roles remain separate from live authenticated accounts. This is a working entry link, not shared authentication between the two apps.

Early geolocation fixes now synchronize the selected district immediately with the map; permission denial / unavailable device location remains a browser/environment limitation. No real device location success is claimed. Automated location tests use injected coordinates.

Validation: signup continuation browser test, Google entry navigation test (destination mocked), location/signup regression test, production build. No deployment, remote DB changes, or live payments.
