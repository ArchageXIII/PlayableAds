# Manual platform checks

Current state: **release destination/device verification pending**. Preliminary maintainer tests on 6 October 2026 established:

- Google: a Pocket treasure test ZIP uploaded, rendered in preview and saved successfully. This established upload/preview behaviour, not the final click destination or moderation approval.
- Unity: a successful test upload was reported by the maintainer. Preview, device behaviour, final destination and the uploaded artifact's exact hash were not independently verified.

These preliminary observations are not release `platform-check` passes and do not cover both reference games or every OS. Public exports now include the MIT notice and have different hashes; verify your exact release artifacts with your own app destinations and accounts. Private account evidence is not distributed in this repository.

For each release, configure real store URLs and build/verify in release mode. Keep dist/<game>/report.json with the files you upload. It identifies exact artifact hashes; rebuilding invalidates prior platform-check evidence if hashes change.

## Destination preflight

Compare the game's brief with the actual campaign settings before a release check. Reuse supplied answers and resolve any pending destination requirements; do not guess app URLs or campaign identifiers.

- Confirm the advertised app identity, OS, target platform, objective and languages agree with the brief and creative.
- Record the destination intent and expected URL/listing/in-app content for each platform/OS. Include installed/not-installed behaviour when deep linking applies.
- For Unity, compare the release report's store URL with the intended app and the uploaded OS-specific HTML. Changing the configured URL requires rebuilding and recording the new hash.
- For Google, record the campaign/ad group and advertised app/OS, plus custom-listing or deep/deferred-link settings when applicable. Verify app-side link handling separately. A campaign routing change requires fresh destination evidence even when the creative hash stays the same.
- Review CTA copy and timing: the current runtime displays the button on the success/failure end card following gameplay interaction, and only a subsequent explicit CTA gesture requests navigation.

See [destination ownership and official sources](authoring.md#destination-and-cta-workflow). External website requests need a separate campaign/export approach; this checklist does not enable that destination in the current shared profile.

## Unity

Upload the appropriate OS's index.html to the User Acquisition dashboard as a responsive playable. Open it using Unity's Ad Testing app on Android and iOS. Check artwork loading, instructions, interaction, rotation, pause/background behaviour, audio/mute, end cards, replay and the native container close UI. Tap the end-card install CTA and verify that the correct app store page opens. Never create a close control or override the SDK's skip behaviour.

Dashboard hosting supplies a test URL/QR code. Self-hosting is optional and outside this toolkit; an iOS test URL must be HTTPS and end in .html. Record device model, OS, SDK/app version where available, date, findings and artifact hash. Test old devices separately before claiming legacy support.

## Google

Choose an **App install campaign**, configure the real app/destination routing, and upload its playable.zip. Check acceptance and the preview in both orientations, gameplay, timing and audio. A successful preview may block navigation intentionally. Local mocked CTA dispatch proves which SDK method our game calls; preview is not a live click/attribution test. Record upload results, preview observations, campaign OS/app configuration, and artifact hash. Do not launch a paid campaign as part of this checklist.

## Recording destination evidence

Keep the expected destination and observed result separate. Record the date/tester, game, platform/OS, artifact path and SHA-256, campaign/ad group when applicable, device/test environment, app installation state, expected URL/listing/content, observed URL/screen and any mismatch. State whether observations were made directly or reported by the user. Retain pending details as pending rather than assigning a hash from a later rebuild.

| Observation | What it establishes |
| --- | --- |
| Intercepted CTA | The local adapter dispatched the expected SDK call; no real destination was opened. |
| Preview navigation blocked | The host suppressed navigation; final destination verification remains pending. |
| Destination verified | An explicit CTA gesture reached the recorded app/listing/content in the stated environment. This does not establish attribution or live campaign performance. |
| Failed or pending | Record a mismatch/error as failed, or an unperformed check as pending, with the next check needed. |

A successful upload alone is not a destination pass. Do not record an overall release pass with required destination/device checks still pending. Store partial observations in the brief or test notes until the release checklist is complete; the command below accepts only pass/fail and requires a release build.

Record the manual evidence with:

```powershell
npm.cmd run platform-check -- --game my-game --platform unity --os android --result pass --tester "Your name" --notes "Completed checks: app/OS match; expected destination <actual store URL>; observed <actual URL/screen>; CTA destination verified on <device/OS>; upload, gameplay and close-overlay results <details>"
```

Use --platform google and/or --os ios for the other checks. Results are appended to platform-checks/<game>.json against the verified artifact hash. The command refuses preview builds and performs no upload. Build reports conservatively retain platformAcceptance: pending and releaseReady: false; the manual record is the evidence, not an automatic certification flag. Failed checks remain in the record and must be resolved against a new or corrected artifact.
