# Contributing to PlayableAds

Clone the repository and follow the [README](README.md) to install dependencies and run the playable lab. Read [AGENTS.md](AGENTS.md) and the [authoring guide](docs/authoring.md) before changing a game or runtime service.

## Changes and pull requests

- Create a branch for your change and open a pull request against `main` with the problem, resulting behaviour and validation results.
- Keep games within the Canvas 2D runtime boundaries: no external engines, runtime asset downloads, tracking, storage or direct browser navigation. Shared services own input, audio, lifecycle and platform CTA dispatch.
- New games need a completed brief, declared local assets, portrait/landscape inspection and an exported-game smoke test. Keep unknown release destinations marked pending.
- Run `npm run check` (use `npm.cmd` in PowerShell). For Windows server-control changes, also run `& .\tests\server-control.ps1`; this requires ports 5173/5174, stops the project preview and leaves it stopped.
- Fix validator failures rather than bypassing them. Report device and platform verification gaps; local tests and upload acceptance are not platform certification.
- Keep real release configuration, credentials, customer assets, logs and screenshots out of commits and pull requests. Use neutral fixtures. Public CI only builds preview exports and never uploads creatives or starts campaigns.

The toolkit and included samples are MIT licensed by Magicave Holdings Limited. Contributions must be code and assets you have the right to provide under that license. Dependencies retain their own licenses. Keep the toolkit's MIT notice in exports containing its runtime; the exporter adds it automatically.

## Optional plugin changes

Keep shared authoring guidance agent-neutral. The Codex plugin reads the selected checkout's documentation rather than duplicating the runtime or platform rules. For packaged skill or metadata changes, bump the plugin manifest version and update its changelog. Run `npm test` for package contract checks and follow the [plugin guide](docs/codex-plugin.md) to exercise installation and updates with isolated Codex configuration. Changes to the plugin must not silently update users' game projects or enable the plugin by default.
