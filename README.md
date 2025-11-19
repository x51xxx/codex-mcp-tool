# Codex MCP Tool

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/x51xxx/codex-mcp-tool?logo=github&label=GitHub)](https://github.com/x51xxx/codex-mcp-tool/releases)
[![npm version](https://img.shields.io/npm/v/@trishchuk/codex-mcp-tool)](https://www.npmjs.com/package/@trishchuk/codex-mcp-tool)
[![npm downloads](https://img.shields.io/npm/dt/@trishchuk/codex-mcp-tool)](https://www.npmjs.com/package/@trishchuk/codex-mcp-tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Open Source](https://img.shields.io/badge/Open%20Source-❤️-red.svg)](https://github.com/x51xxx/codex-mcp-tool)

</div>

Codex MCP Tool is an open‑source Model Context Protocol (MCP) server that connects your IDE or AI assistant (Claude, Cursor, etc.) to the Codex CLI. It enables non‑interactive automation with `codex exec`, safe sandboxed edits with approvals, and large‑scale code analysis via `@` file references. Built for reliability and speed, it streams progress updates, supports structured change mode (OLD/NEW patch output), and integrates cleanly with standard MCP clients for code review, refactoring, documentation, and CI automation.

- Ask Codex questions from your MCP client, or brainstorm ideas programmatically.

<a href="https://glama.ai/mcp/servers/@trishchuk/codex-mcp-tool">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@trishchuk/codex-mcp-tool/badge" alt="Codex Tool MCP server" />
</a>

## TLDR: [![Claude](https://img.shields.io/badge/Claude-D97757?logo=claude&logoColor=fff)](#) + Codex CLI

Goal: Use Codex directly from your MCP-enabled editor to analyze and edit code efficiently.

## Prerequisites

Before using this tool, ensure you have:

1. **[Node.js](https://nodejs.org/)** (v18.0.0 or higher)
2. **[Codex CLI](https://github.com/openai/codex)** installed and authenticated

### Platform Support

✅ **Windows, macOS, and Linux fully supported**

**v1.2.4** introduced cross-platform compatibility improvements using `cross-spawn`, ensuring reliable command execution across all operating systems. Windows users no longer experience "spawn codex ENOENT" errors.

### One-Line Setup

```bash
claude mcp add codex-cli -- npx -y @trishchuk/codex-mcp-tool
```

### Verify Installation

Type `/mcp` inside Claude Code to verify the Codex MCP is active.

---

### Alternative: Import from Claude Desktop

If you already have it configured in Claude Desktop:

1. Add to your Claude Desktop config:

```json
"codex-cli": {
  "command": "npx",
  "args": ["-y", "@trishchuk/codex-mcp-tool"]
}
```

2. Import to Claude Code:

```bash
claude mcp add-from-claude-desktop
```

## Configuration

Register the MCP server with your MCP client:

### For NPX Usage (Recommended)

Add this configuration to your Claude Desktop config file:

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

### For Global Installation

If you installed globally, use this configuration instead:

```json
{
  "mcpServers": {
    "codex-cli": {
      "command": "codex-mcp"
    }
  }
}
```

**Configuration File Locations:**

- **Claude Desktop**:
  - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
  - **Linux**: `~/.config/claude/claude_desktop_config.json`

After updating the configuration, restart your terminal session.

## Example Workflow

- Natural language: "use codex to explain index.html", "understand this repo with @src", "look for vulnerabilities and suggest fixes"
- Claude Code: Type `/codex-cli` to access the MCP server tools.

## Usage Examples

### Model Selection

Default: `gpt-5.1-codex-max` (v1.3.0+) with automatic fallback → `gpt-5-codex` → `gpt-5` when newer models are unavailable.

**GPT-5.1 family with examples**

- `gpt-5.1-codex-max` — default for complex, multi-file edits (`'use codex to refactor @src with model gpt-5.1-codex-max'`)
- `gpt-5.1-codex-mini` — cost-efficient quick passes (`'use codex with model gpt-5.1-codex-mini to scan @utils'`)
- `gpt-5.1`, `gpt-5.1-mini`, `gpt-5.1-nano` — general-purpose GPT-5.1 variants (`'ask codex using gpt-5.1-nano for a fast read on @README.md'`)

```javascript
// Use the default gpt-5.1-codex-max model (falls back to gpt-5-codex → gpt-5)
'explain the architecture of @src/';

// Use gpt-5 for fast general purpose reasoning
'use codex with model gpt-5 to analyze @config.json';

// Use o3 for deep reasoning tasks
'use codex with model o3 to analyze complex algorithm in @algorithm.py';

// Use o4-mini for quick tasks
'use codex with model o4-mini to add comments to @utils.js';

// Use codex-1 for software engineering
'use codex with model codex-1 to refactor @legacy-code.js';
```

### With File References (using @ syntax)

- `ask codex to analyze @src/main.ts and explain what it does`
- `use codex to summarize @. the current directory`
- `analyze @package.json and list dependencies`

### General Questions (without files)

- `ask codex to explain div centering`
- `ask codex about best practices for React development related to @src/components/Button.tsx`

### Brainstorming & Ideation

- `brainstorm ways to optimize our CI/CD pipeline using SCAMPER method`
- `use codex to brainstorm 10 innovative features for our app with feasibility analysis`
- `ask codex to generate product ideas for the healthcare domain with design-thinking approach`

### Codex Approvals & Sandbox

Codex supports approval/sandbox modes. This server uses `codex exec` and can opt into `--full-auto` when `sandbox=true`.

- `use codex to create and run a Python script that processes data`
- `ask codex to safely test @script.py and explain what it does`

### Native Search

- Enable search with `search:true` or the `--search` flag; defaults to `workspace-write` sandbox for network access
- Dual-flag compatibility: sends native `--search` on Codex CLI v0.52.0+ and always enables the `web_search_request` feature flag for older versions
- Works alongside `oss`/feature toggles without manual client changes

### Advanced Examples

```javascript
// Using ask-codex with specific model
'ask codex using gpt-5 to refactor @utils/database.js for better performance';

// Brainstorming with constraints
"brainstorm solutions for reducing API latency with constraints: 'must use existing infrastructure, budget under $5k'";

// Change mode for structured edits
'use codex in change mode to update all console.log to use winston logger in @src/';
```

### Tools (for the AI)

These tools are designed to be used by the AI assistant.

#### Core Tools

- **`ask-codex`**: Sends a prompt to Codex via `codex exec`.
  - Supports `@` file references for including file content
  - Optional `model` parameter; default: `gpt-5.1-codex-max` with fallback chain `gpt-5.1-codex-max → gpt-5-codex → gpt-5` when a model is unavailable
  - GPT-5.1 family stays enabled automatically on Codex CLI v0.56.0+; older CLI versions trigger the fallback chain
  - Available models:
    - `gpt-5.1-codex-max` (NEW DEFAULT v1.3.0, highest reliability)
    - `gpt-5.1-codex-mini` (cost-efficient, quick tasks)
    - `gpt-5.1`, `gpt-5.1-mini`, `gpt-5.1-nano` (GPT-5.1 family)
    - `gpt-5-codex` (previous default, still supported)
    - `gpt-5` (general purpose, fast reasoning)
    - `o3` (smartest, deep reasoning)
    - `o4-mini` (fast & efficient)
    - `codex-1` (o3-based for software engineering)
    - `codex-mini-latest` (low-latency code Q&A)
    - `gpt-4.1` (legacy support)
  - Native Search: uses dual flags (adds `--search` on v0.52.0+ and always enables `web_search_request`) for compatibility
  - `sandbox=true` enables `--full-auto` mode
  - `changeMode=true` returns structured OLD/NEW edits
  - Supports approval policies, sandbox modes, and verbose control via `toolOutputTokenLimit`

- **`brainstorm`**: Generate novel ideas with structured methodologies.
  - Multiple frameworks: divergent, convergent, SCAMPER, design-thinking, lateral
  - Domain-specific context (software, business, creative, research, product, marketing)
  - Supports same models as `ask-codex` (default: `gpt-5.1-codex-max` with the same fallback chain)
  - Configurable idea count and analysis depth
  - Includes feasibility, impact, and innovation scoring
  - Example: `brainstorm prompt:"ways to improve code review process" domain:"software" methodology:"scamper"`

- **`ping`**: A simple test tool that echoes back a message.
  - Use to verify MCP connection is working
  - Example: `/codex-cli:ping (MCP) "Hello from Codex MCP!"`

- **`help`**: Shows the Codex CLI help text and available commands.

#### Advanced Tools

- **`fetch-chunk`**: Retrieves cached chunks from changeMode responses.
  - Used for paginating large structured edit responses
  - Requires `cacheKey` and `chunkIndex` parameters

- **`timeout-test`**: Test tool for timeout prevention.
  - Runs for a specified duration in milliseconds
  - Useful for testing long-running operations

## Advanced Features (v1.3.0+)

### Version Detection & Compatibility

- Automatically parses `codex --version` to toggle feature flags and pick the safest model available
- GPT-5.1 family is auto-enabled on Codex CLI v0.56.0+; older versions gracefully fall back to `gpt-5-codex` → `gpt-5`
- Native search, `--add-dir`, and token-limit flags are only sent when your installed CLI supports them

### Multi-Directory Projects

- Use `addDirs` to allow writes across multiple repositories or temp folders (requires Codex CLI v0.59.0+)
- Example: `ask codex prompt:"upgrade shared configs" addDirs:["../shared-config","/tmp/sandbox"]`
- The tool auto-skips unsupported flags on older CLI builds while logging a warning

### Response Verbosity Control

- Cap tool outputs with `toolOutputTokenLimit` (range: 100–10,000) to tame noisy commands
- Example: `ask codex prompt:"summarize @logs" toolOutputTokenLimit:500`
- Great for CI logs or quick scans where concise responses are needed

### Slash Commands (for the User)

You can use these commands directly in Claude Code's interface (compatibility with other clients has not been tested).

- **/analyze**: Analyzes files or directories using Codex, or asks general questions.
  - **`prompt`** (required): The analysis prompt. Use `@` syntax to include files (e.g., `/analyze prompt:@src/ summarize this directory`) or ask general questions (e.g., `/analyze prompt:Please use a web search to find the latest news stories`).
- **/sandbox**: Safely tests code or scripts with Codex approval modes.
  - **`prompt`** (required): Code testing request (e.g., `/sandbox prompt:Create and run a Python script that processes CSV data` or `/sandbox prompt:@script.py Test this script safely`).
- **/help**: Displays the Codex CLI help information.
- **/ping**: Tests the connection to the server.
  - **`message`** (optional): A message to echo back.

## Codex CLI Compatibility

| Codex CLI version | What you get                                               | Model behavior                                                                     |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| v0.59.0+          | `--add-dir`, `tool_output_token_limit`, Windows agent mode | Full GPT-5.1 support with fallback chain `gpt-5.1-codex-max → gpt-5-codex → gpt-5` |
| v0.56.0+          | GPT-5.1 family unlocked                                    | Uses GPT-5.1 models directly; still falls back if a model is missing               |
| v0.52.0+          | Native `--search` flag                                     | Dual-flag search (`--search` + `web_search_request`) for reliability               |
| earlier           | Legacy-only flags                                          | Forces fallback to `gpt-5-codex`/`gpt-5`, skips unsupported flags with warnings    |

## Troubleshooting (legacy versions)

- Run `codex --version` to confirm your CLI build; upgrade to v0.59.0+ for full v1.3.0 features
- If GPT-5.1 models error on older CLIs, explicitly set `model:"gpt-5-codex"` (the fallback will apply automatically otherwise)
- Remove `addDirs` or `toolOutputTokenLimit` if you see unsupported flag warnings; they require v0.59.0+
- Web search issues on pre-v0.52.0 builds: rely on the `web_search_request` feature flag only, or upgrade for the `--search` flag

## FAQ

- **What model is used by default?** `gpt-5.1-codex-max` with fallback to `gpt-5-codex` then `gpt-5`.
- **How do I switch to a cheaper model?** Set `model:"gpt-5.1-codex-mini"` (or `gpt-5.1-nano` for fastest scans) in your tool call.
- **Can I limit output verbosity?** Yes—use `toolOutputTokenLimit` between 100 and 10,000 to cap tool responses.
- **How do I let Codex touch multiple repos?** Pass `addDirs:["../shared","/tmp/work"]` (CLI v0.59.0+); older versions will warn and skip the flag.
- **How is native search handled?** The tool sends both `--search` (when available) and the `web_search_request` feature flag to stay compatible.

## Migration: v1.2.x → v1.3.0

- Default model switches to `gpt-5.1-codex-max`; fallback chain now formalized (`gpt-5.1-codex-max → gpt-5-codex → gpt-5`)
- New features: `addDirs` for multi-directory writes and `toolOutputTokenLimit` for output control (both require Codex CLI v0.59.0+)
- Native search now uses the dual-flag approach automatically; no config changes needed
- Recommendation: update Codex CLI to v0.59.0+ and refresh your MCP config (no schema changes—existing `/mcp` entries still work)

## Acknowledgments

This project was inspired by the excellent work from [jamubc/gemini-mcp-tool](https://github.com/jamubc/gemini-mcp-tool). Special thanks to [@jamubc](https://github.com/jamubc) for the original MCP server architecture and implementation patterns.

## Contributing

Contributions are welcome! Please submit pull requests or report issues through GitHub.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

**Disclaimer:** This is an unofficial, third-party tool and is not affiliated with, endorsed, or sponsored by OpenAI.
