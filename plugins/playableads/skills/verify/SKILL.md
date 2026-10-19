---
name: verify
description: Build and verify PlayableAds Unity HTML and Google ZIP artifacts, inspect failures and report local versus release readiness. Use for PlayableAds export QA and release checklists, not automatic ad uploads or campaign launches.
---

# Verify playable exports

Work in the user's selected PlayableAds checkout, never the plugin cache. Read its `AGENTS.md`, `README.md`, `docs/authoring.md`, `docs/platform-checks.md` and relevant game briefs. Use that checkout's commands and validators. If no project or game can be identified, ask for the missing selection. Do not change project versions, remotes or unrelated files during verification.

## Local preview

Use `npm.cmd` in PowerShell and `npm` elsewhere. For local QA or pending destination details, run `npm run build -- --game <id> --mode preview` and `npm run verify -- --game <id>`. Use `--all` instead of `--game` for all games when requested. Run the checkout's type checks, tooling tests and relevant exported-browser tests. `npm run check` is the complete reference suite; it rebuilds preview outputs and does not establish a new game's coverage unless tests have been added for that game.

Inspect portrait/landscape play, rotation, hidden-state pausing, replay and explicit CTA dispatch through the available host harness. Report tests that could not be run. Validate actual Unity HTML and Google ZIP contents, not merely development pages. Read `dist/<id>/report.json` for mode, artifact paths, byte sizes, hashes and check results. Distinguish intercepted SDK dispatch from navigation blocked in a platform preview and an actually verified destination.

## Release intent

If release verification is requested, check the brief against supplied real app/store configuration, target OS and campaign intent. Unknown material details stay **pending**: preview checks can continue but must not be presented as release qualification. Do not fabricate URLs or silently replace release output with preview output; run the full preview suite before the final requested release build.

Use the existing release build and verification commands only with supplied real configuration. Unity embeds its configured URL, so a destination change needs a rebuild. Google uses `ExitApi.exit()` and campaign routing; the game does not supply a custom click URL. Follow the project's documentation for deep links and external-website requests instead of adding navigation code.

Keep manual platform/device results tied to exact artifact hashes. Only record results actually observed or explicitly supplied by the user, attributed accordingly. A successful local check, ES5 syntax check or earlier upload does not prove moderation approval, legacy-device compatibility or acceptance of newly rebuilt artifacts. Never upload creatives or start campaigns automatically. Finish with separate local-check results and pending release/platform checks.
