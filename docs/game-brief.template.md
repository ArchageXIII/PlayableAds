# Game brief

Reuse answers already supplied by the user. Ask for missing information that affects the experience or destination; mark unknown release details **pending** so preview work can continue. Resolve destination requirements before release. These answers guide authoring and manual verification; they are not additional build configuration fields.

## Intent

- Game ID:
- Advertised app / target audience:
- One-sentence mechanic:
- What a first-time player should understand immediately:

## Experience

- Visual direction / colours / supplied references:
- Assets supplied or needed (local PNG/JPEG, optional WAV):
- Instructions:
- Tap / drag / other controls:
- Portrait layout:
- Landscape layout:
- Success condition:
- Failure condition:
- Session length (default 15–30 seconds):
- Replay behaviour:
- Optional sound cues:

## End card

- Success copy:
- Failure copy:
- CTA copy:
- Requested CTA timing (default: end card after success or failure, following gameplay interaction):

The current runtime opens the destination only on a subsequent explicit CTA gesture. A request for different timing needs review against runtime capabilities and platform rules; completing the game never triggers navigation automatically.

## App, destination and campaign

- Advertised app name and identity (Android package / iOS app ID when known):
- Target operating systems (Android / iOS / both):
- Target ad platforms (Unity / Google / both):
- Campaign objective (current shared profile: app installs):
- Creative languages and corresponding campaign languages:
- Intended destination per platform/OS (default store listing / custom store listing / specific in-app content / external website):
- Real Google Play URL (required for Android release; never invent it):
- Real App Store URL (required for iOS release; never invent it):
- Any custom listing or in-app destination requested, including its URL/identifier:
- Google advertised app and OS:
- Google campaign and ad group (name/ID when known; pending during authoring is fine):
- Google custom-listing setup (none / pending / configured, with intended listing):
- Google deep/deferred-link setup (none / pending / configured, with intended content and app handling status):
- Expected destination for users with and without the app installed, where applicable:
- Outstanding destination decisions or setup:

Unity embeds the configured store URL; Google routes the CTA through its campaign configuration. Record external website requests for a separately scoped campaign/export approach; this brief does not enable website navigation. See the repository-root guides `docs/authoring.md` (Destination and CTA workflow) and `docs/platform-checks.md`.

## Acceptance

- Main user journey and meaningful edge cases:
- Devices/layouts to inspect:
- New mechanic smoke test:
- Local checks:
- Brief versus campaign app/OS/destination comparison:
- Expected destination versus observed CTA result (intercepted / preview blocked / destination verified / failed / pending):
- Platform checks and artifact hashes (pending until performed):
