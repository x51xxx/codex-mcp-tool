## Sandbox and approvals

Codex CLI separates filesystem isolation from approval behavior. Current
sandbox values are `read-only`, `workspace-write`, and `danger-full-access`.
Current approval values are `untrusted`, `on-request`, and `never`.

| Intent                             | Flags                                                     | Effect                                                     |
| ---------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Read-only interactive analysis     | `--sandbox read-only --ask-for-approval on-request`       | Reads safely and can request escalation                    |
| Read-only non-interactive analysis | `--sandbox read-only --ask-for-approval never`            | Reads only and never pauses for approval                   |
| Interactive repository work        | `--sandbox workspace-write --ask-for-approval on-request` | Edits the workspace and asks before escalation             |
| Non-interactive repository work    | `--sandbox workspace-write --ask-for-approval never`      | Edits the workspace; denied escalations return as failures |
| Externally isolated automation     | `--dangerously-bypass-approvals-and-sandbox`              | No Codex sandbox and no approval prompts                   |

`--full-auto` and the `on-failure` approval policy have been removed from
current Codex CLI. Use explicit sandbox and approval values instead.

```bash
codex --sandbox workspace-write --ask-for-approval never \
  exec "Implement the feature and run tests"
```

`never` does not disable the sandbox. It prevents interactive approval prompts;
commands that need more access fail and the result is returned to the agent.
The dangerous bypass flag removes both protections and should only be used in
an externally hardened container or VM.

Persistent configuration:

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"
```

The MCP compatibility parameters `sandbox: true` and `fullAuto: true` expand to
workspace-write plus approval `never`; they never expand to the dangerous
bypass flag.

See [Sandbox modes for MCP](./concepts/sandbox.md) for tool examples and the
[official Codex security documentation](https://developers.openai.com/codex/security).
