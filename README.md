# Codex MCP Server

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/x51xxx/codex-mcp-tool?logo=github&label=GitHub)](https://github.com/x51xxx/codex-mcp-tool/releases)
[![npm version](https://img.shields.io/npm/v/@trishchuk/codex-mcp-tool)](https://www.npmjs.com/package/@trishchuk/codex-mcp-tool)
[![npm downloads](https://img.shields.io/npm/dt/@trishchuk/codex-mcp-tool)](https://www.npmjs.com/package/@trishchuk/codex-mcp-tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

</div>

MCP server connecting Claude/Cursor to Codex CLI. Enables code analysis via `@` file references, multi-turn conversations, sandboxed edits, and structured change mode.

## Features

- **File Analysis** — Reference files with `@src/`, `@package.json` syntax
- **Multi-Turn Sessions** — Conversation continuity with workspace isolation
- **Native Resume** — Uses `codex resume` for context preservation (CLI v0.36.0+)
- **Local OSS Models** — Run with Ollama or LM Studio via `localProvider`
- **Web Search** — Research capabilities with `search: true`
- **Sandbox Mode** — Safe automation with explicit sandbox and approval policies
- **Change Mode** — Structured OLD/NEW patch output for refactoring
- **Brainstorming** — SCAMPER, design-thinking, lateral thinking frameworks
- **Health Diagnostics** — CLI version, features, and session monitoring
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
'use codex with model gpt-5.6-sol to analyze @algorithm.py';

// Multi-turn conversations (v1.4.0+)
'ask codex sessionId:"my-project" prompt:"explain @src/"';
'ask codex sessionId:"my-project" prompt:"now add error handling"';

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

| Tool             | Description                                                         |
| ---------------- | ------------------------------------------------------------------- |
| `ask-codex`      | Execute Codex CLI with files, models, sessions, and safety controls |
| `batch-codex`    | Run multiple atomic Codex tasks sequentially or concurrently        |
| `review-changes` | Run the native non-interactive Codex review command                 |
| `do-act`         | Execute, verify with a shell command, and retry fixes               |
| `image-gen`      | Generate or edit images with Codex's built-in `image_gen` tool      |
| `brainstorm`     | Generate ideas with structured creative frameworks                  |
| `list-sessions`  | View, delete, or clear MCP conversation mappings                    |
| `list-skills`    | List skills visible from the selected workspace                     |
| `health`         | Diagnose CLI installation, version, features, and sessions          |
| `fetch-chunk`    | Retrieve a chunk from cached change-mode output                     |
| `ping`           | Test the MCP connection                                             |
| `help`           | Return current `codex --help` output                                |
| `version`        | Report Codex CLI, Node.js, platform, and package versions           |
| `timeout-test`   | Exercise keepalive and timeout behavior                             |

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
| `gpt-6-sol`     | Previous-generation workhorse                              |
| `gpt-6-luna`    | Fast and affordable; easier, repeatable tasks              |
| `gpt-5.6-sol`   | Older-generation workhorse                                 |
| `gpt-5.6-terra` | Older balanced model for straightforward work              |
| `gpt-5.6-luna`  | Older fast, efficient model                                |
| `gpt-5.5`       | Legacy — Codex steers callers to `gpt-5.6-sol`             |

Sol, Astra and Terra models expose `max` and `ultra` reasoning; Luna models top
out at `max`, and `gpt-5.5` at `xhigh`. `ultra` may delegate work to subagents;
most tasks should remain on `medium` or `high`. Pass a concrete slug — the bare
moving aliases `gpt-6` and `gpt-5.6` are rejected by the API. `gpt-6.1-sol` is
rejected by Codex CLI 0.157.x with the same 400 an unknown slug gets; upgrade
with `npm install -g @openai/codex@latest`.

## Key Features

### Session Management (v1.4.0+)

Multi-turn conversations with workspace isolation:

```javascript
{ "prompt": "analyze code", "sessionId": "my-session" }
{ "prompt": "continue from here", "sessionId": "my-session" }
{ "prompt": "start fresh", "sessionId": "my-session", "resetSession": true }
```

**Environment:**

- `CODEX_SESSION_TTL_MS` - Session TTL (default: 24h)
- `CODEX_MAX_SESSIONS` - Max sessions (default: 50)

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

## CLI Compatibility

Validated against Codex CLI `0.144.3`. The server keeps older feature guards,
but current releases are recommended. Notable current behavior:

- `--full-auto` and approval policy `on-failure` have been removed by Codex CLI.
- MCP `sandbox: true` / `fullAuto: true` remain compatibility aliases for
  `--sandbox workspace-write --ask-for-approval never`; they do not bypass the sandbox.
- Native `--search` is used without the deprecated `web_search_request` feature.
- Current `exec` flags include `--strict-config`, `--ephemeral`,
  `--ignore-user-config`, and `--ignore-rules`.

## Troubleshooting

```bash
codex --version    # Check CLI version
codex login        # Authenticate
```

Use `health` tool for diagnostics: `'use health verbose:true'`

## Migration

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
