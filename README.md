# pi-model-prompt — custom prompts per model in Pi

A Pi extension that stores a custom prompt for each provider/model and applies the active model's prompt to future requests.

```bash
pi install npm:@lukemelnik/pi-model-prompt
```

```text
/model-prompt edit
```

## Features

- **Custom prompt per model** — keep separate instructions for each Pi provider/model pair.
- **Global storage** — reuse the same model prompts across sessions and projects.
- **Interactive editing** — create or update the active model's custom prompt in Pi's editor.
- **Read and clear commands** — inspect or delete the active model's custom prompt with slash commands.
- **Agent-manageable tools** — let the model inspect or edit its own custom prompt only when explicitly requested.
- **Visible state** — show a status indicator when the active model has a non-empty custom prompt.

## Install

Install from npm:

```bash
pi install npm:@lukemelnik/pi-model-prompt
```

Install project-locally instead of globally:

```bash
pi install npm:@lukemelnik/pi-model-prompt -l
```

Install from GitHub or a local checkout:

```bash
pi install git:github.com/lukemelnik/pi-model-prompt
pi install /absolute/path/to/pi-model-prompt
```

## Quick Start

Install the package, open Pi, then create a custom prompt for the currently selected model:

```text
/model-prompt edit
```

Save the text in the editor. The custom prompt is applied the next time a user prompt starts; it does not change a response already in progress.

Inspect or remove the custom prompt later:

```text
/model-prompt show
/model-prompt clear
```

## Commands

| Command | Description |
|---------|-------------|
| `/model-prompt` | Open the editor for the active model's custom prompt. |
| `/model-prompt edit` | Same as `/model-prompt`. |
| `/model-prompt show` | Show the active model's custom prompt and file path. |
| `/model-prompt clear` | Delete the active model's custom prompt after confirmation. |

## Agent Tools

This package registers tools that Pi can use when explicitly asked to inspect or modify custom model behavior.

| Tool | Description |
|------|-------------|
| `model_prompt_show` | Show the current custom prompt for the active model. |
| `model_prompt_edit` | Edit the current custom prompt with exact text replacements. Creates a new file with one edit whose `oldText` is an empty string. |

Tool changes apply on the next user prompt. Ask the agent to show the current custom prompt before editing unless the exact current contents are already known.

## Storage

Custom prompts are stored under the Pi agent directory:

```text
~/.pi/agent/model-prompts/<provider>/<encoded-model-id>.md
```

For example, a model ID containing `/` is URL-encoded in the filename. Empty or missing files are ignored.

## Manage the Package

```bash
pi list
pi config
pi update npm:@lukemelnik/pi-model-prompt
pi remove npm:@lukemelnik/pi-model-prompt
```

If the package was installed project-locally, pass `-l` to `pi remove`:

```bash
pi remove npm:@lukemelnik/pi-model-prompt -l
```

## Requirements

- Pi with package support.
- An active Pi model. No extra API key is required beyond the model already selected in Pi.

## Development

Maintainer setup, type checking, and release commands are documented in [docs/development.md](docs/development.md).

## License

MIT
