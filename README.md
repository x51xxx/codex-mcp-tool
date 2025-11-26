# Codex MCP Tool

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
- **Web Search** — Research capabilities with `search: true`
- **Sandbox Mode** — Safe code execution with `--full-auto`
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
'explain the architecture of @src/'
'analyze @package.json and list dependencies'

// With specific model
'use codex with model o3 to analyze @algorithm.py'

// Multi-turn conversations (v1.4.0+)
'ask codex sessionId:"my-project" prompt:"explain @src/"'
'ask codex sessionId:"my-project" prompt:"now add error handling"'

// Brainstorming
'brainstorm ways to optimize CI/CD using SCAMPER method'

// Sandbox mode
'use codex sandbox:true to create and run a Python script'

// Web search
'ask codex search:true prompt:"latest TypeScript 5.7 features"'
```

## Tools

| Tool | Description |
|------|-------------|
| `ask-codex` | Execute Codex CLI with file analysis, models, sessions |
| `brainstorm` | Generate ideas with SCAMPER, design-thinking, etc. |
| `list-sessions` | View/delete/clear conversation sessions |
| `health` | Diagnose CLI installation, version, features |
| `ping` / `help` | Test connection, show CLI help |

## Models

Default: `gpt-5.1-codex-max` with fallback → `gpt-5-codex` → `gpt-5`

| Model | Use Case |
|-------|----------|
| `gpt-5.1-codex-max` | Complex multi-file edits (default) |
| `gpt-5.1-codex-mini` | Cost-efficient quick tasks |
| `o3` | Deep reasoning |
| `o4-mini` | Fast & efficient |
| `codex-1` | Software engineering |

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

### Advanced Options

| Parameter | Description |
|-----------|-------------|
| `model` | Model selection |
| `sessionId` | Enable conversation continuity |
| `sandbox` | Enable `--full-auto` mode |
| `search` | Enable web search |
| `changeMode` | Structured OLD/NEW edits |
| `addDirs` | Additional writable directories |
| `toolOutputTokenLimit` | Cap response verbosity (100-10,000) |

## CLI Compatibility

| Version | Features |
|---------|----------|
| v0.59.0+ | `--add-dir`, token limits, full GPT-5.1 |
| v0.52.0+ | Native `--search` flag |
| v0.36.0+ | Native `codex resume` (sessions) |

## Troubleshooting

```bash
codex --version    # Check CLI version
codex login        # Authenticate
```

Use `health` tool for diagnostics: `'use health verbose:true'`

## Migration

**v1.3.x → v1.4.0:** New `sessionId` parameter, `list-sessions`/`health` tools, structured error handling. No breaking changes.

## License

MIT License. Not affiliated with OpenAI.

---

[Documentation](https://x51xxx.github.io/codex-mcp-tool/) | [Issues](https://github.com/x51xxx/codex-mcp-tool/issues) | Inspired by [jamubc/gemini-mcp-tool](https://github.com/jamubc/gemini-mcp-tool)
