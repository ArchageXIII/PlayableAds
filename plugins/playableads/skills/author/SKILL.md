---
name: author
description: Create or change a Canvas 2D playable ad in a PlayableAds toolkit project, from brief through responsive preview and exported-game tests. Use for PlayableAds game authoring, not arbitrary game engines or advertising campaign management.
---

# Author a playable

Find the user's selected PlayableAds checkout, not the installed plugin directory. Read its `AGENTS.md`, `README.md`, `docs/authoring.md`, `docs/game-brief.template.md` and the target game's brief. These project files are the current command and runtime contract; do not assume a plugin update upgraded the checkout. If the project is missing, guide setup before editing. If its interfaces differ from these instructions, inspect the actual implementation and explain the mismatch rather than silently upgrading it.

Reuse the user's answers. Ask for missing mechanic, audience, visual direction, assets, instructions, success/failure, session length and CTA details that affect the work. Record unknown app/store URLs, OS, platform, destination, campaign and language details as **pending** and continue local preview work. Resolve material gameplay ambiguity before designing extra features.

For a new game, use the checkout's scaffolder with a unique id and the closest `tap` or `drag` template. For an existing game, preserve its brief and unrelated changes. Work in `games/<id>` with declared local assets. Use Canvas 2D and the shared runtime interfaces; input, audio, timing, lifecycle and installation belong to runtime services. Do not introduce external engines, tracking, storage, remote gameplay assets or direct navigation. Hidden time must not advance progress; rotation preserves state and cancels drags. Complete through the shared end-card flow, with navigation requiring a later explicit CTA gesture.

Implement meaningful checks for the requested mechanic and an exported-game smoke test for a new game. Inspect actual portrait and landscape previews using available browser tooling. Run the checks specified by the checkout; build previews explicitly with `--mode preview`, verify them, and exercise the exported artifacts. Existing reference-game tests do not prove a newly authored game works.

Fix actual failures without weakening validators. Keep preview instrumentation outside shipping code. Summarize changed files, the actual visual and automated checks, and remaining destination/device/platform work. Follow `docs/platform-checks.md` before describing anything as release-ready. Do not upload creatives, host previews or launch campaigns as part of authoring.


## Universal Google exports (toolkit capability check)

Before using platform-selection flags, inspect the selected checkout's README and `tooling/cli.ts` for `--platform google|unity|all` build support and its report schema. An installed plugin update does not upgrade the project. On an older checkout, use its documented commands and explain that universal exports require a reviewed toolkit upgrade; do not silently pull or modify it.

On a compatible checkout, Google builds use `--platform google` without `--os` and produce one `dist/<id>/google/playable.zip`. Google-only release builds do not read Unity store configuration. Keep actual campaign/app/OS/destination checks pending until verified. Unity builds use `--platform unity` with OS-specific URLs; the default `--platform all` retains combined builds. Use `--mode preview` for preview work. `verify --game <id>` validates the entire latest schema-2 report and takes no build-selection flags. A rebuild migrates older reports and removes only the known obsolete per-OS Google ZIPs. Manual Google checks still require `--os` as campaign context, saved as `campaignOs` against the universal ZIP hash.
