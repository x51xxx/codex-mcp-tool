# Client Configuration Guides

Ready-to-use configuration files for integrating Codex MCP Tool with popular AI coding assistants.

## Available Configs

| Client                                            | File                                   | What it provides                     |
| ------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| [Claude Code](claude-code.md)                     | `CLAUDE.md` snippet + `.mcp.json`      | Project instructions for Claude Code |
| [Cursor](cursor.md)                               | `.cursor/rules/codex.mdc` + MCP config | Cursor rules + MCP setup             |
| [Cline / Roo Code / KiloCode](cline-roocode.yaml) | Custom mode YAML                       | "Codex Pair Programmer" mode         |

## Core Workflow (all clients)

All configs follow the same 4-step pair programming workflow:

1. **Plan** — Ask Codex for a plan before writing code
2. **Prototype** — Get code in read-only sandbox mode
3. **Review** — Critically evaluate and adapt to project conventions
4. **Verify** — Send final code back to Codex for edge case review

## MCP Server Setup

All clients use the same MCP server command:

```json
{
  "command": "npx",
  "args": ["-y", "@trishchuk/codex-mcp-tool"]
}
```
