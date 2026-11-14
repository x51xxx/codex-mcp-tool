# Codex MCP Server

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/x51xxx/codex-mcp-tool?logo=github&label=GitHub)](https://github.com/x51xxx/codex-mcp-tool/releases)
[![npm version](https://img.shields.io/npm/v/@trishchuk/codex-mcp-tool)](https://www.npmjs.com/package/@trishchuk/codex-mcp-tool)
[![npm downloads](https://img.shields.io/npm/dt/@trishchuk/codex-mcp-tool)](https://www.npmjs.com/package/@trishchuk/codex-mcp-tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

</div>

MCP server connecting Claude/Cursor to Codex CLI. Enables code analysis via `@` file references, multi-turn conversations, sandboxed edits, and structured change mode.

The [project page on trishchuk.com](https://trishchuk.com/projects/codex-mcp-tool/) gives an overview of the server: setup, the tool reference, model recommendations and Codex CLI compatibility notes. It also links to a case study on using this server as an outside advisor to Claude Code.

## Features

- **File Analysis** — Reference files with `@src/`, `@package.json` syntax
- **Multi-Turn Sessions** — Conversation continuity, isolated per working directory
- **Native Resume** — Uses `codex exec resume` and keeps the session's model
- **Code Review** — Native `codex review` in a read-only sandbox
- **Act-Check-Fix** — `do-act` runs a task, verifies it with a shell command, and retries in the same conversation
- **Image Generation** — Codex's built-in `image_gen` with a structured prompt spec
- **Local OSS Models** — Run with Ollama or LM Studio via `localProvider`
- **Web Search** — Research capabilities with `search: true`
- **Sandbox Mode** — Safe automation with explicit sandbox and approval policies
- **Change Mode** — Structured OLD/NEW patch output for refactoring
- **Brainstorming** — SCAMPER, design-thinking, lateral thinking frameworks
- **Cancellation** — Cancelling a tool call stops the Codex process
- **Health Diagnostics** — CLI path, version, authentication, and sessions
- **Cross-Platform** — Windows, macOS, Linux fully supported

## Quick Start

```bash
claude mcp add codex-cli -- npx -y @trishchuk/codex-mcp-tool
```

**Prerequisites:** Node.js 18+, [Codex CLI](https://github.com/openai/codex) installed and authenticated.

### Configuration

```json
{
  "mcpServers": {
    "codex-cli": {
      "command": "npx",
      "args": ["-y", "@trishchuk/codex-mcp-tool"]
    }
  }
}
```

**Config locations:** macOS: `~/Library/Application Support/Claude/claude_desktop_config.json` | Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## Usage Examples

```javascript
// File analysis
'explain the architecture of @src/';
'analyze @package.json and list dependencies';

// With specific model
'use codex with model gpt-6-astra to analyze @algorithm.py';

// Multi-turn conversations (v1.4.0+)
'ask codex sessionId:"my-project" prompt:"explain @src/"';
'ask codex sessionId:"my-project" prompt:"now add error handling"';

// Code review of the working tree
'review-changes uncommitted:true';

// Do the task, verify with tests, retry on failure
'do-act task:"fix the failing date parser" verify:{command:"npm test"}';

// Brainstorming
'brainstorm ways to optimize CI/CD using SCAMPER method';

// Sandbox mode
'use codex sandbox:true to create and run a Python script';

// Web search
'ask codex search:true prompt:"latest TypeScript 5.7 features"';

// Local OSS model (Ollama)
'ask codex localProvider:"ollama" model:"qwen3:8b" prompt:"explain @src/"';
```

## Tools

| Tool             | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| `ask-codex`      | Execute Codex CLI with files, models, sessions, and safety controls          |
| `batch-codex`    | Run multiple atomic Codex tasks sequentially or concurrently                 |
| `review-changes` | Run the native Codex review (`codex review`) in a read-only sandbox          |
| `do-act`         | Execute, verify with a shell command, and retry fixes                        |
| `image-gen`      | Generate or edit images with Codex's built-in `image_gen` tool               |
| `brainstorm`     | Generate ideas with structured creative frameworks                           |
| `list-sessions`  | View, delete, or clear MCP conversation mappings                             |
| `list-skills`    | List project (`.agents/skills`, `.codex/skills`) and user skills             |
| `health`         | Diagnose CLI path, version, authentication, and sessions                     |
| `fetch-chunk`    | Retrieve a chunk from cached change-mode output                              |
| `ping`           | Test the MCP connection                                                      |
| `help`           | Return current `codex --help` output                                         |
| `version`        | Report Codex CLI, Node.js, platform, and package versions                    |
| `timeout-test`   | Exercise keepalive and timeout behavior (only with `CODEX_MCP_TEST_TOOLS=1`) |

## Image generation

`image-gen` drives Codex's built-in `image_gen` tool, so it uses your ChatGPT
login and needs no `OPENAI_API_KEY`. That tool only accepts a prompt and
reference image paths: Codex picks the image model and pixel size, and there
are no size, quality, format or mask arguments. `image-gen` therefore puts all
steering into a structured prompt (use case, asset type, style, composition,
exact text, reference roles, edit invariants, aspect ratio, presets) and tells
the Codex host model to relay it instead of improvising.

```javascript
// New image, 16:9, exact Cyrillic headline, copied into the project
'image-gen prompt:"YouTube cover about AI coding agents" aspect:"wide" text:"АГЕНТИ БЕЗ ХАОСУ" presets:["thumbnail","exact-text"] outputPath:"assets/cover.png"';

// Edit: change only the headline, keep everything else
'image-gen editImage:"assets/cover.png" prompt:"Replace the headline text" text:"ЧАСТИНА 2" preserve:["people and background"] outputPath:"assets/cover.png"';
```

Images are saved by Codex under `$CODEX_HOME/generated_images/<thread>/` and
copied to `outputPath` when given; an existing file is kept and the copy is
written as a `-v2` sibling unless `overwrite: true`. The result reports each
file's dimensions and alpha channel, so a `transparentBackground` request that
came back opaque is flagged.

## Models

By default the `model` parameter is **omitted** and Codex CLI applies the
default model from your `~/.codex/config.toml` (for example `model = "gpt-6.1-sol"`).
Pass `model` only when you need to override the configured default for a
single call. Reasoning depth is calibrated per tool:

- `ask-codex` — uses the Codex CLI default reasoning (medium). Increase it only when the task needs more planning or checking.
- `brainstorm`, `do-act`, `review-changes` — default `reasoningEffort: "high"` (creative ideation, act-check-fix loops, and code review benefit from deeper reasoning).

| Model           | Recommendation                                             |
| --------------- | ---------------------------------------------------------- |
| `gpt-6.1-sol`   | Latest workhorse for coding and everyday work (CLI 0.159+) |
| `gpt-6-astra`   | Frontier intelligence for the most demanding work          |
| `gpt-6.1-terra` | Fast, efficient: visual reasoning, computer use, writing   |
| `gpt-6-sol`     | Previous-generation workhorse                              |
| `gpt-6-luna`    | Fast and affordable; easier, repeatable tasks              |
| `gpt-5.6-sol`   | Older-generation workhorse                                 |
| `gpt-5.6-terra` | Older balanced model for straightforward work              |
| `gpt-5.6-luna`  | Older fast, efficient model                                |

`gpt-5.5` was retired for ChatGPT sign-in on 2026-10-14; with API-key auth it
still runs and is passed through as an unlisted slug.

Sol, Astra and Terra models expose `max` and `ultra` reasoning; Luna models top
out at `max`. `ultra` may delegate work to subagents;
most tasks should remain on `medium` or `high`. Pass a concrete slug — the bare
moving aliases `gpt-6` and `gpt-5.6` are rejected by the API. `gpt-6.1-sol` is
rejected by Codex CLI 0.157.x with the same 400 an unknown slug gets; upgrade
with `npm install -g @openai/codex@latest`.

## Key Features

### Session Management

Multi-turn conversations resume the native Codex thread (`codex exec resume`):

```javascript
{ "prompt": "analyze code", "sessionId": "my-session", "model": "gpt-6-luna" }
{ "prompt": "continue from here", "sessionId": "my-session" }   // still gpt-6-luna
{ "prompt": "start fresh", "sessionId": "my-session", "resetSession": true }
```

- A session remembers its model: a follow-up without `model` stays on it
  instead of switching to your config default.
- Sessions are bound to their working directory. Reusing the same `sessionId`
  in another directory starts a separate conversation there, and both stay
  resumable; switching git branches in the same directory keeps it.
  `list-sessions action:delete` takes an optional `workingDir` to remove just
  one of them.
- Sessions live in memory (`CODEX_SESSION_TTL_MS`, default 24h;
  `CODEX_MAX_SESSIONS`, default 50) and are lost when the server restarts.

### Working directory

Codex runs in, by priority: the `workingDir` argument → `CODEX_MCP_CWD` →
the project of the first `@path` in the prompt → `PWD`/`INIT_CWD` → the server's
current directory. A `workingDir` that does not exist is an error — the call is
refused rather than run (and possibly edit files) somewhere else.

### Errors and cancellation

Failed calls return `isError: true` with a categorized message (model, auth,
rate limit, timeout, sandbox, network, session, cancelled). Only Codex's own
`ERROR:` lines are classified, so an unknown model is reported as a model
error. Cancelling a tool call from the client stops the running `codex` process;
a run stopped by a timeout or the output limit is never returned as a result.

### Codex CLI version

Requires **Codex CLI `0.95.0` or newer**. On older versions the server fails
with an explicit upgrade message rather than silently dropping unsupported
flags. Upgrade with `npm install -g @openai/codex@latest`; run the `health` tool
to see the detected version.

### Troubleshooting: "codex not found"

MCP clients launched from a GUI (Dock, Finder, Start menu) inherit a minimal
`PATH` that excludes Homebrew, nvm, and volta directories, so `codex` may work
from a terminal but not from the app. The server searches those locations
automatically; if it still cannot find the CLI, pin it explicitly:

```json
{ "env": { "CODEX_CLI_PATH": "/opt/homebrew/bin/codex" } }
```

Find the value with `which codex`. Run the `health` tool to see which
executable was resolved and how.

### Local OSS Models (v1.6.0+)

Run with local Ollama or LM Studio instead of OpenAI:

```javascript
// Ollama
{ "prompt": "analyze @src/", "localProvider": "ollama", "model": "qwen3:8b" }

// LM Studio
{ "prompt": "analyze @src/", "localProvider": "lmstudio", "model": "my-model" }

// Auto-select provider
{ "prompt": "analyze @src/", "oss": true }
```

**Requirements:** [Ollama](https://ollama.com) running locally with a model that supports tool calling (e.g. `qwen3:8b`).

### Advanced Options

| Parameter              | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `model`                | Model selection                                   |
| `sessionId`            | Enable conversation continuity                    |
| `sandbox`              | Compatibility automation: workspace-write + never |
| `search`               | Enable web search                                 |
| `changeMode`           | Structured OLD/NEW edits                          |
| `addDirs`              | Additional writable directories                   |
| `toolOutputTokenLimit` | Cap response verbosity (100-10,000)               |
| `reasoningEffort`      | low, medium, high, xhigh, max, ultra              |
| `oss`                  | Use local OSS model provider                      |
| `localProvider`        | Local provider: `lmstudio` or `ollama`            |
| `strictConfig`         | Fail on unknown Codex configuration keys          |
| `ephemeral`            | Do not persist Codex session files                |
| `ignoreUserConfig`     | Ignore `$CODEX_HOME/config.toml`                  |
| `ignoreRules`          | Ignore execpolicy `.rules` files                  |
| `personality`          | `pragmatic`, `friendly`, or `none`                |
| `profile`              | Layer `$CODEX_HOME/<name>.config.toml` (`-p`)     |
| `timeout`              | Per-call limit in ms (positive integer)           |

### Environment variables

| Variable               | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `CODEX_CLI_PATH`       | Absolute path to `codex` (GUI clients with a minimal PATH) |
| `CODEX_MCP_CWD`        | Working directory for every call without `workingDir`      |
| `CODEX_SESSION_TTL_MS` | Session lifetime in ms (default 86400000 = 24h)            |
| `CODEX_MAX_SESSIONS`   | Maximum stored sessions (default 50)                       |
| `CODEX_MCP_TEST_TOOLS` | `1` registers the diagnostic `timeout-test` tool           |

## CLI Compatibility

Validated against Codex CLI `0.169.0` (minimum `0.95.0`). Notable current behavior:

- `--full-auto` and the `on-failure`/`untrusted` approval policies have been
  removed by Codex CLI.
- MCP `sandbox: true` / `fullAuto: true` remain compatibility aliases for
  `--sandbox workspace-write --ask-for-approval never`; they do not bypass the sandbox.
- `approvalPolicy: "on-request"` is accepted, but non-interactive `codex exec`
  runs still report `approval: never` — nobody can answer a prompt.
- `profile` uses profile V2 files (`$CODEX_HOME/<name>.config.toml`). Codex
  refuses `-p <name>` while `config.toml` still has a legacy
  `[profiles.<name>]` table, and `strictConfig` fails on such tables too.
- Prompts are passed after `--`, so a prompt that starts with `-` (a markdown
  list) works; prompts over 100 KB go over stdin.
- Native `--search` is used without the deprecated `web_search_request` feature.

## Troubleshooting

```bash
codex --version       # Check CLI version
codex login status    # Check authentication (exit 0 = logged in)
codex login           # Authenticate
```

Use `health` tool for diagnostics: `'use health verbose:true'`

## Development

```bash
npm run build     # compile to dist/
npm run lint      # type-check
npm test          # build + node --test suite (no extra dependencies)
```

## Migration

**v2.6.x → v2.7.0:** bug-fix release from the 2026-11-14 audit (see CHANGELOG).
Added `gpt-6.1-terra`. **Breaking:** an explicit `workingDir` that does not
exist is now an error instead of a silent fallback; `@path` references in the
prompt now take priority over `PWD`; `gpt-5.5` is no longer listed (retired for
ChatGPT sign-in — with API-key auth it still passes through); `timeout-test` is
registered only with `CODEX_MCP_TEST_TOOLS=1`. Failed tool calls now return
`isError: true`.

**v2.5.x → v2.6.0:** Codex CLI `0.159.2` model sync and a new `image-gen` tool.
Added `gpt-6.1-sol` (needs Codex CLI 0.159+), `gpt-6-sol` and `gpt-6-luna`.
**Breaking:** dropped `gpt-5.4-mini`, which now returns HTTP 400.

**v2.4.x → v2.5.0:** Codex CLI `0.153.4` compatibility pass; added
`gpt-6-astra`. **Breaking:** dropped `gpt-5.4` and the moving alias `gpt-5.6`
(both now rejected with HTTP 400), and removed the `untrusted` approval policy,
which Codex CLI 0.153.x no longer parses.

**v2.3.x → v2.4.0:** Codex CLI `0.144.3` compatibility audit; added GPT-5.6
Sol/Terra/Luna, `max`/`ultra` reasoning, current exec flags, native-only search,
and safe compatibility handling for the removed `--full-auto` flag and
`on-failure` approval policy.

**v2.2.x → v2.3.0:** `gpt-5.5` as new default, added `gpt-5.4-mini`, dropped retired models (`gpt-5.3-codex-spark`, `gpt-5.2-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`).

**v2.0.x → v2.1.0:** `gpt-5.4` as new default model, updated fallback chain.

**v1.5.x → v1.6.0:** Local OSS model support (`localProvider`, `oss`), `gpt-5.3-codex` default model, `xhigh` reasoning effort.

**v1.3.x → v1.4.0:** New `sessionId` parameter, `list-sessions`/`health` tools, structured error handling. No breaking changes.

## License

MIT License. Not affiliated with OpenAI.

---

[Documentation](https://x51xxx.github.io/codex-mcp-tool/) | [Issues](https://github.com/x51xxx/codex-mcp-tool/issues) | Inspired by [jamubc/gemini-mcp-tool](https://github.com/jamubc/gemini-mcp-tool)
