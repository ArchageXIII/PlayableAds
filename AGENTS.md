# PlayableAds authoring instructions

This repository creates lightweight **2D playable ads** from briefs. Read README.md and docs/authoring.md before creating or changing a game. Respect direct user instructions and existing game briefs.

## Game boundaries

- Use Canvas 2D and runtime services. No 3D, WebGL, external game engines, runtime network resources, telemetry, storage or browser navigation.
- Keep each game in games/<id> with game.ts, game.config.json, brief.md and declared local assets. Use `npm run create-game -- --id <id> --template tap|drag` (npm.cmd in PowerShell).
- Game source imports only its local modules and src/runtime/types or src/runtime/math. Platform SDKs, asset loading, sound, input, clocks, CTA buttons and completion are owned by the shared runtime.
- Do not bypass the source/export policy or add mocks/debug controls to shipping code. Extend the shared runtime if a brief requires a reusable capability.
- Support portrait and landscape from the same game. Resize preserves game state and cancels any current drag. Keep important interactions below the reserved host UI zone.
- Use context.elapsed for countdown logic and dt for animation; hidden time must never count. Complete through context.complete('success'|'failure'). No game-generated install action.
- Prefer native shapes and small PNG/JPEG sprites. Declare artwork/audio in the config. Do not silently fetch assets or generate paid assets without authorization. Optional WAV audio must go through context.playSound(id).
- Disposal/replay must remove game-owned listeners or references. Keep session state in memory. Aim for instantly clear instructions and a 15–30 second interaction, unless the brief says otherwise.

## Required workflow

1. Fill the brief with the user's mechanic, audience, style, assets, instructions, success/failure conditions, session length and CTA copy/timing. Collect the advertised app, target OS/platforms, real store URLs, destination intent, objective, languages and Google campaign setup using docs/game-brief.template.md. Reuse supplied answers; ask only for missing information. Mark unknown release details **pending** and continue preview work. Resolve material ambiguity before designing unrelated features.
2. Implement gameplay with the shared interface and add meaningful gameplay checks for new mechanics. Inspect both portrait and landscape visually in the lab.
3. Run typecheck and tooling tests, build both preview profiles, verify them, then run appropriate exported-browser tests. `npm run check` performs the full reference suite. A new game needs its own exported-game smoke test; the existing tests only prove the reference games.
4. Fix actual failures; do not disable a validator to make a build pass. Mention any support/verification limitation.
5. Resolve destination requirements before calling a game ready for release. Release only with supplied real store configuration; compare the brief with the campaign's actual app, OS and destination. Record expected versus observed CTA results, distinguishing intercepted dispatch, blocked preview navigation and a verified destination. Never invent app URLs or report platform acceptance from local tests. Record real platform results against exact artifact hashes using the platform-check command.

Destination answers belong in the brief and release checklist, not new game config fields. Unity embeds release-configured store URLs and uses mraid.open; Google calls ExitApi.exit() without a URL and uses campaign routing. Google deep links also require app support. External website destinations need a separately scoped campaign/export approach. Default CTA timing is the end card after success or failure following gameplay interaction, with a subsequent explicit gesture required to navigate; review requests for other timing before implementation.

Keep development tooling and preview instrumentation outside exports. Preserve the literal Google ExitAPI script in the head; Unity uses host-injected MRAID without an external script. Recheck the official source links before changing platform policy. Do not automatically upload creatives, host previews, or start campaigns.
