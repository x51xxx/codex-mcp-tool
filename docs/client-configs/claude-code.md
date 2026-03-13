# Claude Code — Codex MCP Integration

Add this to your project's `CLAUDE.md` to teach Claude Code how to use Codex effectively.

## CLAUDE.md snippet

```markdown
## Codex MCP Integration

This project has Codex MCP tools available. Use them for implementation tasks that benefit from a second AI perspective.

### When to use Codex

- Complex algorithm or business logic implementation
- Deep refactoring of legacy code
- Bug diagnosis and fixing
- Writing unit tests with high coverage
- Code review and quality checks

### Workflow: Codex as Pair Programmer

1. **Plan first** — Send requirements to `ask-codex` and ask for a plan or pseudocode before writing code.
2. **Safe prototyping** — Use `sandboxMode: "read-only"` to get code suggestions without file modifications.
3. **Review and adapt** — Don't blindly apply Codex output. Review it, fix naming, adapt to project conventions, then apply changes yourself.
4. **Feedback loop** — After applying changes, send the updated code back to Codex via `review-changes` to check for edge cases.

### Session continuity

Always reuse `sessionId` from previous responses when continuing the same task. This keeps Codex's context coherent across multiple calls.

### Tool selection guide

| Task                           | Tool             | Key params                           |
| ------------------------------ | ---------------- | ------------------------------------ |
| Code analysis / implementation | `ask-codex`      | `prompt`, `sandboxMode: "read-only"` |
| Refactoring with diffs         | `ask-codex`      | `changeMode: true`                   |
| Autonomous coding              | `do-act`         | `prompt`, auto-approval              |
| Code review                    | `review-changes` | `base: "main"`                       |
| Brainstorming                  | `brainstorm`     | `prompt`, `methodology`              |
| Batch refactoring              | `batch-codex`    | `tasks: [...]`, `parallel: true`     |

### Safety rules

- Prefer `sandboxMode: "read-only"` for analysis tasks
- Use `sandboxMode: "workspace-write"` only when Codex needs to modify files
- Never use `"danger-full-access"` unless explicitly requested
- If Codex returns code with errors, send the error back to Codex instead of fixing silently
```

## MCP config for Claude Code

Add to `.mcp.json` in your project root:

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
