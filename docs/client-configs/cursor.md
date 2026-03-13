# Cursor — Codex MCP Integration

## Cursor Rules

Add to `.cursor/rules/codex.mdc` in your project:

```markdown
---
description: Codex MCP pair programming workflow
globs:
alwaysApply: false
---

# Codex Pair Programmer

You have access to Codex MCP tools for AI-assisted coding. Use them as a second opinion, not as a replacement for your own judgment.

## Workflow

1. **Plan** — Use `ask-codex` with `sandboxMode: "read-only"` to get implementation ideas before writing code.
2. **Prototype** — Get code from Codex in read-only mode. Never let Codex write files directly.
3. **Review** — Critically evaluate Codex output. Fix bugs, adapt naming, ensure project conventions. Apply changes yourself.
4. **Verify** — Use `review-changes` to have Codex review the final result for edge cases.

## Session Management

Reuse `sessionId` from previous Codex responses when working on the same task. This maintains context across calls.

## Tool Quick Reference

- `ask-codex` — Main tool for code analysis, generation, Q&A. Use `@file.ts` syntax to include files.
- `ask-codex` with `changeMode: true` — Get structured OLD/NEW diffs for refactoring.
- `do-act` — Autonomous mode with auto-approval. Use for well-defined tasks.
- `review-changes` — Code review against git diffs.
- `brainstorm` — Idea generation with methodology frameworks.
- `batch-codex` — Parallel execution of multiple tasks.

## Safety

- Default to `sandboxMode: "read-only"` for analysis
- Use `sandboxMode: "workspace-write"` only when file changes are needed
- If Codex returns errors, feed the error back to Codex for self-correction
```

## MCP config for Cursor

Add to `.cursor/mcp.json`:

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
