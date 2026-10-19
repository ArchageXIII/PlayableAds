# Author a playable

## Destination and CTA workflow

Start with the [brief template](game-brief.template.md). Reuse information from the user's request and existing brief, then ask for missing answers that affect the game or destination. Capture the advertised app and store URLs, target OS/ad platforms, destination intent, campaign objective, languages and CTA copy/timing. For Google, also capture the app/OS, campaign/ad group when known, custom listing and deep-link requirements. Use **pending** for unknown release details and continue preview work; resolve them before calling the game ready for release. This is an authoring checklist, not a new machine-enforced build gate.

| Platform | Destination ownership and release action |
| --- | --- |
| Unity | Put the real OS-specific store URLs in `release.config.json` (`storeUrls.android` / `storeUrls.ios`), or the file passed with `--config`. The exporter embeds the URL and the adapter calls `mraid.open(storeUrl)`. Rebuild and reverify after changing it. Unity requires a direct app-store destination. |
| Google | Configure the advertised app and destination routing in Google Ads. The adapter calls `ExitApi.exit()` with no URL; it does not use the shared runtime's store URL to choose the destination. Campaign-only routing changes do not require changing game code, but do require another destination check. |

Destination sources reviewed 6 October 2026; Google export integration rechecked 19 October 2026: [Unity playable specifications](https://docs.unity.com/en-us/user-acquisition/creatives/creative-specifications) and [Google playable specifications](https://support.google.com/google-ads/answer/9981650?hl=en).

For custom store listings, record the intended listing and verify the applicable platform/campaign setup. For Google in-app destinations, record the deep/deferred link and whether the app handles it; configure supported routing in Google Ads and test the appropriate installed/not-installed journey. See [Google's deep-link setup](https://support.google.com/google-ads/answer/10024200?hl=en). Recording a URL does not establish that a particular campaign or placement supports that route. The current Google profile targets App install campaigns; HTML5 playables are not eligible for App engagement or pre-registration campaigns under the linked specifications.

If the user requests an external website destination, record that intent and scope a separate campaign/export approach before promising support. Do not embed direct browser navigation or substitute a website URL for Unity's required store URL.

The current CTA appears on the end card after success or failure, following gameplay interaction. Both outcomes require a later explicit CTA gesture to request navigation. Capture requests for different timing, but review them against the shared runtime and platform rules before implementation. Keep CTA text aligned with the actual destination and creative language; the current template uses English, and recording another language does not automatically translate the game or change its HTML language metadata.

Before release, compare the completed brief, supplied release configuration and actual campaign settings using the [platform checklist](platform-checks.md). Existing URL validation checks syntax and known placeholders; it does not verify app ownership, campaign routing or the destination reached on a device. Campaign notes remain in the brief/check evidence, while supported store URLs remain in the existing release config.

## Export selection

Use `build --platform google --mode preview` for one universal Google ZIP, or `build --platform unity --os android,ios --mode preview` for Unity HTMLs. Include `--game <id>` (or `--all`) with these commands. The default `--platform all` builds both profiles, with `--os` selecting Unity targets only. Google-only builds reject `--os` and do not read Unity release configuration, even in release mode.

Google's output is `dist/<id>/google/playable.zip`; Unity's is `dist/<id>/<os>/unity/index.html`. Schema-2 reports describe only the latest build selection. Rebuild schema-1 reports. Verification accepts `--game`/`--all`, not build-selection flags. Google preview/release bytes may be identical; campaign setup and actual destination checks remain separate from build mode.

## Runtime authoring

Each game exports `createGame: CreateGame` from game.ts. The factory receives a shared context with the config, current layout in CSS pixels, loaded images, elapsed gameplay time, interaction state and services. Return these hooks:

| Hook | Responsibility |
| --- | --- |
| `update(dt)` | Advance simulation using seconds; called only during active, interacted gameplay |
| `render(canvas)` | Draw the current state with the supplied Canvas 2D context |
| `resize(layout)` | Preserve progress and reflow positions; cancel in-flight drag state |
| `onInput(input)` | Handle down/move/up/cancel in canvas-relative CSS pixels with a stable pointer ID |
| `dispose()` | Release game-owned resources before replay/unload |

Use `context.layout.width/height` for positions and `context.images.<id>` for sprites. Pixel ratio is handled by the runtime and capped at 2. Do not multiply input positions by pixel ratio. Runtime helpers provide clamp, lerp, easing, circular hit testing and sprite drawing. Keep hit areas generous; provide visible clues rather than relying on colour alone for real campaigns.

Use `context.setProgress(text)` for the HUD, `context.playSound()` for a short synthesized cue or `context.playSound(assetId)` for a declared WAV, and `context.complete(outcome)` for the end card. The runtime owns the time limit and automatic failure. Time starts on the first gameplay gesture; it freezes when hidden. A clamped dt prevents large jumps on a slow frame. Completion stops simulation and displays CTA/replay controls; no navigation happens until a later trusted CTA gesture.

Game config contains id, title, instructions, durationSeconds (3–120), successText, failureText, ctaText, accent (six-digit hex), and assets keyed by stable IDs. Each asset has `path` and `kind: image|audio`. Paths stay inside the game directory; escaping paths, symlinks, remote URLs and unsupported formats fail builds. Audio decoding/playback is optional and must not stop gameplay.

The image loader sets anonymous cross-origin mode before assigning data URIs. It waits for artwork before enabling gameplay. Missing/corrupt artwork produces an inactive error state. Current image support is PNG and JPEG; current audio support is embedded PCM WAV. The build reports source bytes and embedded bytes, so you can identify oversized assets before release.

New games are copied from a reference template. Replace its mechanic/config and fill in the brief. Add a test that mounts that game's actual exported artifact, plays its real interaction, checks completion/replay, and inspects more than one orientation. For local authoring, `npm run dev -- --game <id>` selects it in the lab. The browser host bypasses ad readiness for fast iteration; final QA must use both platform modes.

The default 48 CSS-pixel top reserve is a conservative layout choice, **not a platform-specified safe-zone guarantee**. Device insets add to it where supported. Inspect close overlays and actual devices; adjust shared layout safely if necessary. Legacy CSS/API fallbacks are intentional. Avoid APIs that require unbundled polyfills. ES5 syntax checks do not validate every old browser API.

Source auditing, exported AST/HTML checks and network tests are complementary guardrails, not a security sandbox or an exhaustive static proof. Keep generated game code reviewable, and test paths that could trigger side effects.

Runtime configuration is platform-specific: Unity has `platform`, `targetOs` and `storeUrl`; Google and Browser have `platform` without either destination field. Games should use shared gameplay fields and completion services. Host adapters now expose parameterless `exit()`; Unity binds its URL when its adapter is constructed. Custom runtime integrations using the previous interface need updating.

## Optional preview interface

Use the compact toolbar to select a game, preview platform and viewport, or restart the live preview. Google has no OS selector; Unity remembers its selected OS. Scaled previews retain their selected internal dimensions. Host simulations and event logs are in the collapsed Developer tools section.

The Exported files panel shows the latest report, independent of the live preview. Build through the CLI, then refresh files to download the Google ZIP or recorded Unity HTMLs, view the saved JSON report, or copy a local file path. Verify exports runs current-source verification on demand. A timestamped local pass is not platform approval; source mismatches require rebuilding, refreshing and rechecking. Missing or altered files cannot be downloaded. The browser is optional for builds and automated checks.
