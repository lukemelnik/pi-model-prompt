# pi-model-prompt

A Pi extension for global per-model prompt addenda.

Features:
- Stores prompt addenda per provider/model under `~/.pi/agent/model-prompts/`
- Adds `/model-prompt show|edit|clear`
- Adds `model_prompt_show` and `model_prompt_edit` tools
- Appends the current model's addendum on the next prompt

Install locally:
- `pi install ~/projects/pi-extensions/model-prompt`

Later, after publishing:
- `pi install npm:pi-model-prompt`

No build step is required. Pi loads `src/index.ts` directly.
