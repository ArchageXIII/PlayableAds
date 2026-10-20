# Embedded export manifest

Every Unity HTML and Google ZIP build automatically includes a small, non-rendered HTML comment in the head:

```html
<!--PlayableAdsManifest:{"schemaVersion":1,"generator":"PlayableAds","generatorVersion":"0.1.0","policyVersion":1,"game":"my\u002dgame","platform":"google","mode":"preview","contentSha256":"...64 lowercase hexadecimal characters..."}-->
```

This is an illustrative hash placeholder, not a valid manifest. Unity manifests also contain `"os":"android"` or `"os":"ios"`; Google manifests must omit `os`. The version comes from the toolkit's package metadata. The development-only Browser host has no export manifest; live Unity/Google previews carry `mode: "preview"`.

The manifest adds no executable code, network requests or analytics. Embedding is automatic with no CLI flag, account or configuration requirement. It stays inside `index.html`, so Google's ZIP still contains exactly one file. The complete comment counts toward the existing HTML and ZIP size budgets.

## Format and hashing contract

Schema version 1 requires these fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Manifest format version, currently `1` |
| `generator` | Claimed generator, `PlayableAds` |
| `generatorVersion` | Toolkit package version |
| `policyVersion` | Claimed validation-rule version, currently `1` |
| `game` | Local game ID, using lowercase letters, numbers and single hyphens |
| `platform` | `unity` or `google` |
| `mode` | `preview` or `release` |
| `os` | Required for Unity, forbidden for Google |
| `contentSha256` | SHA-256 of the exact HTML bytes excluding the manifest comment |

Schema 1 rejects unknown fields and unsupported schema/policy versions. Schema versions change when the format changes; policy versions change when the advertised validation rules change. Services can additionally restrict accepted generator versions. Neither version string proves that an unmodified toolkit actually ran.

The builder serializes fields in the order above, with `os` before `contentSha256` when present. It escapes `<`, `>`, `&` and `-` as JSON Unicode escapes to keep the comment safe. The complete comment, including delimiters and marker, must not exceed 4,096 UTF-8 bytes.

To calculate `contentSha256`:

1. Require valid UTF-8 HTML.
2. Locate exactly one actual HTML comment with the reserved `PlayableAdsManifest` marker, directly inside an explicitly opened and closed head. Marker text inside scripts or attributes does not count.
3. Remove only that comment's exact byte range, including `<!--` and `-->`. Preserve all other bytes, including whitespace, line endings, the MIT notice and other comments.
4. SHA-256 the remaining bytes and compare the lowercase hexadecimal result.

Do not parse and reserialize HTML before hashing. Parser character offsets must be converted to UTF-8 byte offsets. The toolkit helper performs this conversion. Manifest metadata itself is excluded from the content hash and is unsigned; changing it may leave the content hash valid. Compare it against known expectations where available.

Repeated builds with the same inputs, toolkit and mode remain byte-for-byte reproducible. Google preview and release exports now differ because their manifest modes differ, even when the underlying ad content is identical. The report's existing `sha256` continues to identify the complete uploaded HTML or ZIP, including the manifest and packaging. Report schema remains 2. Rebuild older exports without manifests.

## Reusable verifier

The Node/TypeScript helpers in `tooling/manifest.ts` do not require game sources, a local build report or filesystem access:

```ts
import { verifyManifest } from './tooling/manifest';
import { validateHtml } from './tooling/validate';

// htmlBytes is the Unity upload or index.html from a safely processed Google ZIP.
const identity = verifyManifest(htmlBytes, {
  platform: 'google',
  mode: 'release'
});
if (!identity.ok) throw new Error(identity.errors.join('\n'));

const technical = validateHtml(htmlBytes, 'google', { mode: 'release' });
if (!technical.ok) throw new Error(technical.errors.join('\n'));

// identity.manifest contains the parsed metadata.
```

`verifyManifest` returns `{ ok, manifest?, errors }`; parsed metadata remains available on a hash or expectation mismatch, but is absent when parsing/schema validation fails. Never treat returned metadata as accepted unless `ok` is true. Optional expectations include game, platform, mode and OS.

`extractManifest(bytes)` returns typed metadata and the remaining content bytes, throwing on structural errors. It does **not** verify the hash. `createManifest(content, metadata)` creates metadata, and `embedManifest(html, metadata)` inserts its safely encoded comment. Neither creation helper runs technical compliance checks.

`validateHtml` verifies the manifest and independently applies the existing export rules. `validateZip` checks the archive and delegates to HTML validation; both accept optional manifest expectations. `verify` additionally compares identity against the saved build report and reproduces the complete artifact from current sources.

## Upload-service integration

Recommended sequence:

1. Enforce upload-size limits and archive safety controls before decompression or HTML processing.
2. Verify the manifest and compare platform/mode and any known game/OS expectations.
3. Run independent technical checks on the actual uploaded content using the service's accepted policy.
4. Store the full upload SHA-256, parsed manifest, server-side check results, policy version and validation timestamp together.

This repository supplies the format and helpers, not an upload service. Its validators are technical guardrails, not an exhaustive sandbox or a replacement for hardened upload handling.

Record “recognised manifest” separately from “passed server checks”. An unsigned manifest can be fabricated and its hash recalculated. It provides identification and accidental-change detection, not trusted provenance or platform approval. Source auditing cannot be reconstructed completely from compiled HTML. Release mode does not prove campaign setup, destination correctness or network acceptance.

Services may associate upload hashes with accounts/campaigns, find duplicate content or identify versions needing revalidation. Game IDs are labels, not globally unique creative IDs. No timestamps, random IDs, local paths, accounts, signing keys or tracking endpoints are embedded. Signing, shared validation receipts and runtime analytics remain separate future work.
