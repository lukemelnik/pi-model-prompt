# pi-model-prompt

A Pi extension for global per-model prompt addenda.

Features:
- Stores prompt addenda per provider/model under `~/.pi/agent/model-prompts/`
- Adds `/model-prompt show|edit|clear`
- Opens the standard Pi editor for bare `/model-prompt`
- Adds `model_prompt_show` and `model_prompt_edit` tools
- Appends the current model's addendum on the next prompt

Install locally:
- `pi install /path/to/pi-model-prompt`

Install from GitHub:
- `pi install git:github.com/lukemelnik/pi-model-prompt`

After publishing:
- `pi install npm:@lukemelnik/pi-model-prompt`

Release:
- `npm run release:patch` or `npm run release:minor` or `npm run release:major`
- `git push origin HEAD --follow-tags`
- `npm run publish:release`

`npm version` is the source of truth for releases here: it updates `package.json`, updates `package-lock.json`, creates a release commit, and creates a `vX.Y.Z` git tag.

No build step is required. Pi loads `src/index.ts` directly.
