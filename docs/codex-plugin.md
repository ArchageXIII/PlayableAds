# Optional Codex plugin

PlayableAds works directly or with a coding agent that can edit files and run local commands. The optional **PlayableAds** plugin adds guided setup, authoring and verification in Codex. It is a skills-only package: no MCP server, external service, API key or advertising-account connection is required. Node, Git and the toolkit checkout are still needed to build games.

## Install from your checkout in the desktop app

1. Clone PlayableAds using the [README](../README.md#run-the-playable-lab), and open the checkout as your local Codex project.
2. Restart the desktop app so it discovers the repository's `.agents/plugins/marketplace.json`.
3. In the Plugins Directory, choose the **PlayableAds** marketplace, select **PlayableAds**, and install it. The catalog makes it available; it does not enable it automatically.
4. Open a new chat in your game project and ask the plugin to set up or inspect the project.

Directory wording and available marketplace sources can vary by client. If the repository source is missing, use the CLI route below with a Codex version that supports plugin marketplaces. Repository marketplaces are distinct from OpenAI's public plugin directory; this project has not submitted a public-directory listing.

## Install a Git-backed marketplace with the CLI

With a supported Codex CLI on your PATH:

```sh
codex plugin marketplace add ArchageXIII/PlayableAds --ref main
codex plugin list --marketplace playableads --available
codex plugin add playableads@playableads
codex plugin list --marketplace playableads
```

This registers a Git-backed catalog and installs the plugin into Codex's cache. It does **not** create a game workspace. Open an existing toolkit checkout, or ask setup to clone one into a chosen new/empty folder. A fork is a valid workspace; setup does not change remotes or upgrade existing projects.

If you already registered a local marketplace named `playableads`, keep that route or remove its registration before switching to the Git-backed source. Avoid registering both under the same name. On older clients, inspect `codex plugin --help` and update the client if these commands are unavailable; do not substitute undocumented install commands.

## Use the skills

The installed skills are namespaced as `playableads:setup`, `playableads:author` and `playableads:verify`. Select the skill from Codex's skill picker, or name it in your request. Example requests:

- “Use playableads:setup to create a fresh toolkit checkout in this empty folder.”
- “Use playableads:setup to prepare this existing checkout and start the local preview.”
- “Use playableads:author to create a 20-second tap-to-collect game with my supplied artwork. The app and store destinations are pending.”
- “Use playableads:verify to check the Unity and Google preview exports for my-game and tell me what still needs manual verification.”

The skills read `AGENTS.md`, the README, authoring guide and game brief from the **selected project**, not the installed plugin cache. They reuse answers already supplied and allow preview work with release details marked **pending**. Release builds still require the existing real-URL configuration and manual destination/device/platform checks. Installing or updating the plugin does not upload creatives or launch campaigns.

## Update or remove

For a Git-backed installation, explicitly refresh the catalog and then refresh the installed plugin:

```sh
codex plugin marketplace upgrade playableads
codex plugin add playableads@playableads
codex plugin list --marketplace playableads
```

The second command is intentional: verify the installed version rather than assuming a catalog refresh updated the installed copy. Restart the desktop app and start a new chat to use refreshed skills. `--ref main` follows published main-branch changes when you request an upgrade; it is not a promise of background automatic updates.

For a repository-local installation, first review and obtain the desired plugin changes in that checkout using your normal Git workflow, then refresh the installed plugin with `codex plugin add playableads@playableads` (register the checkout with `codex plugin marketplace add .` if necessary). Restart the app. `marketplace upgrade` refreshes Git-backed sources, not files in your local working tree.

**Plugin updates and toolkit upgrades are separate.** The plugin updates instructions in Codex's cache. It never pulls or merges changes into your game workspace. To upgrade the toolkit, review upstream changes and merge them through your normal Git workflow, preserving your games, assets and local configuration. Rebuild and reverify artifacts after toolkit changes.

To uninstall and optionally stop tracking the Git-backed catalog:

```sh
codex plugin remove playableads@playableads
codex plugin marketplace remove playableads
```

Uninstalling does not delete your toolkit checkout or games. A catalog committed in a project may still be discoverable in that project after removing a configured marketplace registration.

## Maintenance and validation

The manifest starts at version `0.1.0`. Bump its semantic version whenever packaged skills or metadata change and record the change in the [plugin changelog](../plugins/playableads/CHANGELOG.md). Keep the plugin's bundled MIT license in sync with the repository license. No toolkit runtime is copied into the plugin.

`npm test` includes plugin contract checks, which also run in GitHub Actions through `npm run check`. They check manifest fields, opt-in marketplace policy, path containment, skill frontmatter, onboarding, the license and the packaged-file inventory. They do not prove model behaviour or client compatibility.

Installation, namespaced skill discovery, a local fixture update from `0.1.0` to `0.1.1`, and removal were exercised with isolated Codex configuration on Windows using **codex-cli 0.163.0-alpha.10.2**. The published plugin remains `0.1.0`. Desktop instructions follow official documentation; the desktop UI and other Codex versions have not been separately verified. Workflow smoke checks exercise the documented setup/scaffold/build commands, not an independent model evaluation of every possible prompt.

See the [official plugin packaging, marketplace and installation guidance](https://developers.openai.com/plugins/build/plugins) for client support and directory distribution details.
