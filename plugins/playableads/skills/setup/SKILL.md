---
name: setup
description: Set up the PlayableAds toolkit in a new folder or prepare an existing PlayableAds checkout for local game authoring. Use for PlayableAds onboarding and environment setup.
---

# Set up PlayableAds

This plugin supplies instructions, not the game runtime. Work in the user's selected project directory, never in the installed plugin/cache directory. Installation alone does not authorize creating a project or changing existing files.

## Choose the project

Inspect the current or explicitly selected directory first. A PlayableAds checkout has `package.json` with the existing toolkit scripts (`create-game`, `build`, `verify`, `dev`), `tooling/cli.ts`, `src/runtime/types.ts`, `AGENTS.md`, and `docs/authoring.md`. Do not require a particular remote: forks are valid projects. If multiple projects are plausible, ask which to use.

- For an existing checkout, read its `AGENTS.md`, `README.md` and `docs/authoring.md`, inspect Git status and use its current code. Do not pull, reset, change remotes or replace games as part of setup.
- For a new project, reuse the user's chosen destination or ask for one. Check whether it exists and inspect hidden entries too. Clone `https://github.com/ArchageXIII/PlayableAds.git` only into a nonexistent or empty directory. Quote the path for the actual shell. If it is nonempty and is not a toolkit project, ask for another folder; do not clear it, initialize over it or copy toolkit files into it.
- Resolve all following paths and commands against the selected checkout, not relative to this skill. If the host cannot access that folder, explain the required local workspace selection instead of working in the plugin cache.

## Prepare and preview

Use the checkout's README as the command reference. Check Git, Node and npm first (the initial toolkit requires Node 22.14+). On PowerShell use `npm.cmd`/`npx.cmd`; on macOS/Linux use `npm`/`npx`. Run `npm ci` from that checkout. Install the matching Playwright browsers when browser verification is needed; follow the README's Linux system-dependency instructions.

Build reference previews explicitly with `npm run build -- --all --mode preview`, then `npm run verify -- --all`. Build defaults to release, so never omit preview mode when real app configuration is pending. Start the lab using the checkout's Windows `start.ps1` or its documented development command. Report the actual URL and how to stop it; reuse a healthy project server and leave unrelated port owners alone.

Do not invent app URLs or create release credentials during onboarding. Unknown app, destination and campaign details remain **pending** in game briefs. Finish with the chosen project path, checks actually run, preview URL and unresolved prerequisites. Installing the plugin or passing local checks does not establish platform acceptance.
