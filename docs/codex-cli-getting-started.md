## Getting started

### CLI usage

| Command             | Purpose                                     | Example                               |
| ------------------- | ------------------------------------------- | ------------------------------------- |
| `codex`             | Interactive TUI                             | `codex`                               |
| `codex "..."`       | Interactive TUI with an initial prompt      | `codex "fix lint errors"`             |
| `codex exec "..."`  | Non-interactive agent run                   | `codex exec "explain utils.ts"`       |
| `codex exec resume` | Resume a non-interactive session            | `codex exec resume --last "continue"` |
| `codex review`      | Native non-interactive code review          | `codex review --uncommitted`          |
| `codex doctor`      | Diagnose install, config, auth, and runtime | `codex doctor`                        |
| `codex plugin`      | Manage Codex plugins                        | `codex plugin --help`                 |
| `codex features`    | Inspect feature flags                       | `codex features list`                 |

Key global flags include `--model/-m`, `--sandbox/-s`,
`--ask-for-approval/-a`, `--search`, `--add-dir`, `--strict-config`,
`--oss`, and `--local-provider`. Current approval values are `on-request` and
`never`.

Current `exec`-only flags include `--skip-git-repo-check`, `--ephemeral`,
`--ignore-user-config`, `--ignore-rules`, `--output-schema`, `--json`, and
`--output-last-message/-o`.

<!--
Resume options:

- `--resume`: open an interactive picker of recent sessions (shows a preview of the first real user message). Conflicts with `--continue`.
- `--continue`: resume the most recent session without showing the picker (falls back to starting fresh if none exist). Conflicts with `--resume`.

Examples:

```shell
codex --resume
codex --continue
```
-->

### Running with a prompt as input

You can also run Codex CLI with a prompt as input:

```shell
codex "explain this codebase to me"
```

```shell
codex --sandbox workspace-write --ask-for-approval never \
  exec "create the fanciest todo-list app"
```

The removed `--full-auto` flag should not be used with current Codex CLI.
For non-interactive automation, explicitly select a sandbox and use
`--ask-for-approval never`; failed escalations are returned to the model while
the workspace sandbox remains active. Use the bypass flag only inside an
externally hardened environment.

### Example prompts

Below are a few bite-size examples you can copy-paste. Replace the text in quotes with your own task. See the [prompting guide](https://github.com/openai/codex/blob/main/codex-cli/examples/prompting_guide.md) for more tips and usage patterns.

| ✨  | What you type                                                                   | What happens                                                               |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `codex "Refactor the Dashboard component to React Hooks"`                       | Codex rewrites the class component, runs `npm test`, and shows the diff.   |
| 2   | `codex "Generate SQL migrations for adding a users table"`                      | Infers your ORM, creates migration files, and runs them in a sandboxed DB. |
| 3   | `codex "Write unit tests for utils/date.ts"`                                    | Generates tests, executes them, and iterates until they pass.              |
| 4   | `codex "Bulk-rename *.jpeg -> *.jpg with git mv"`                               | Safely renames files and updates imports/usages.                           |
| 5   | `codex "Explain what this regex does: ^(?=.*[A-Z]).{8,}$"`                      | Outputs a step-by-step human explanation.                                  |
| 6   | `codex "Carefully review this repo, and propose 3 high impact well-scoped PRs"` | Suggests impactful PRs in the current codebase.                            |
| 7   | `codex "Look for vulnerabilities and create a security review report"`          | Finds and explains security bugs.                                          |

### Memory with AGENTS.md

You can give Codex extra instructions and guidance using `AGENTS.md` files. Codex looks for `AGENTS.md` files in the following places, and merges them top-down:

1. `~/.codex/AGENTS.md` - personal global guidance
2. `AGENTS.md` at repo root - shared project notes
3. `AGENTS.md` in the current working directory - sub-folder/feature specifics

For more information on how to use AGENTS.md, see the [official AGENTS.md documentation](https://agents.md/).

### Tips & shortcuts

#### Use `@` for file search

Typing `@` triggers a fuzzy-filename search over the workspace root. Use up/down to select among the results and Tab or Enter to replace the `@` with the selected path. You can use Esc to cancel the search.

#### Image input

Paste images directly into the composer (Ctrl+V / Cmd+V) to attach them to your prompt. You can also attach files via repeatable `-i/--image` flags:

```bash
codex -i screenshot.png "Explain this error"
codex --image img1.png --image img2.jpg "Summarize these diagrams"
```

#### Esc–Esc to edit a previous message

When the chat composer is empty, press Esc to prime “backtrack” mode. Press Esc again to open a transcript preview highlighting the last user message; press Esc repeatedly to step to older user messages. Press Enter to confirm and Codex will fork the conversation from that point, trim the visible transcript accordingly, and pre‑fill the composer with the selected user message so you can edit and resubmit it.

In the transcript preview, the footer shows an `Esc edit prev` hint while editing is active.

#### Shell completions

Generate shell completion scripts via:

```shell
codex completion bash
codex completion zsh
codex completion fish
```

#### `--cd`/`-C` flag

Sometimes it is not convenient to `cd` to the directory you want Codex to use as the "working root" before running Codex. Fortunately, `codex` supports a `--cd` option so you can specify whatever folder you want. You can confirm that Codex is honoring `--cd` by double-checking the **workdir** it reports in the TUI at the start of a new session.
