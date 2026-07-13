# Sandbox modes and approval policies

The MCP server forwards Codex CLI's security controls. Choose filesystem access
and approval behavior independently.

## Sandbox modes

- `read-only`: analysis without workspace edits.
- `workspace-write`: read, edit, and run commands inside the workspace and any
  explicitly supplied `addDirs`.
- `danger-full-access`: unrestricted filesystem policy. Use only when the
  surrounding environment provides isolation.

## Approval policies

- `untrusted`: only commands considered trusted run without approval.
- `on-request`: Codex decides when to request an escalation.
- `never`: Codex never asks; denied operations fail and are returned to the model.

The old `on-failure` value is no longer accepted by current Codex CLI.

## Recommended combinations

| Workload                             | MCP arguments                                                          |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Read-only audit                      | `{ "sandboxMode": "read-only", "approvalPolicy": "never" }`            |
| Interactive edits                    | `{ "sandboxMode": "workspace-write", "approvalPolicy": "on-request" }` |
| Automated edits                      | `{ "sandboxMode": "workspace-write", "approvalPolicy": "never" }`      |
| Externally isolated unrestricted run | `{ "yolo": true }`                                                     |

For automation, `sandbox: true` and `fullAuto: true` are compatibility aliases:

```json
{
  "prompt": "Fix lint errors and run the linter",
  "sandbox": true
}
```

They expand to:

```bash
codex --sandbox workspace-write --ask-for-approval never exec "..."
```

This compatibility behavior retains workspace isolation. It does not invoke
`--dangerously-bypass-approvals-and-sandbox`.

## Additional writable directories

Use `addDirs` only for directories the task genuinely needs:

```json
{
  "prompt": "Update both packages",
  "sandboxMode": "workspace-write",
  "addDirs": ["../shared-package"]
}
```

Each entry becomes a repeatable `--add-dir` flag and expands the writable
surface, so avoid broad parent directories.

## Search and local providers

`search: true`, `oss: true`, and `localProvider` currently select
`workspace-write` when no sandbox is supplied, preserving this package's
existing compatibility behavior. Set `sandboxMode: "read-only"` explicitly for
research-only tasks that should not edit files.

## Dangerous options

- `yolo: true` removes approvals and the Codex sandbox. Use only inside an
  externally hardened environment.
- `bypassHookTrust: true` runs enabled hooks without persisted trust. Use only
  in automation that already validates hook sources.

Prefer the smallest sandbox and writable directory set that can complete the
task.
