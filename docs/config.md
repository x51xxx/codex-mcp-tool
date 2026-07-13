# Codex CLI configuration

Codex CLI loads personal defaults from `$CODEX_HOME/config.toml` (normally
`~/.codex/config.toml`). Trusted repositories may also provide project-specific
`.codex/config.toml` settings.

This page covers the configuration used by Codex MCP Tool. For the complete,
versioned schema, use the
[official Codex configuration reference](https://developers.openai.com/codex/config-reference).

## Recommended baseline

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "medium"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
personality = "pragmatic"
```

Current approval values are `untrusted`, `on-request`, and `never`. The old
`on-failure` value is no longer accepted. Current sandbox values are
`read-only`, `workspace-write`, and `danger-full-access`.

Use the lowest reasoning effort that reliably completes the task. Current MCP
values are `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`; actual support
depends on the selected model. `max` and `ultra` are primarily GPT-5.6
capabilities, and `ultra` may delegate work to subagents.

## Per-run overrides

Use a specific flag when one exists:

```bash
codex --model gpt-5.6-terra \
  --sandbox read-only \
  --ask-for-approval never \
  exec "Audit the repository"
```

Use repeatable `-c/--config key=value` arguments for configuration keys:

```bash
codex -c 'model_reasoning_effort="high"' \
  -c 'personality="pragmatic"' \
  exec "Review the current changes"
```

`--strict-config` makes Codex fail when the loaded configuration contains
unknown fields. It is useful in CI and after CLI upgrades:

```bash
codex --strict-config exec "Run the requested task"
```

## Profiles

The current CLI layers `$CODEX_HOME/<name>.config.toml` over the base config:

```bash
codex --profile ci exec "Run checks"
```

For that example, create `$CODEX_HOME/ci.config.toml`:

```toml
approval_policy = "never"
sandbox_mode = "workspace-write"
model_reasoning_effort = "medium"
```

## MCP server options

The MCP tool accepts either a raw configuration override or an object:

```json
{
  "prompt": "Review @src",
  "config": "model_reasoning_effort=\"high\""
}
```

Prefer dedicated parameters when available because their values are validated:

```json
{
  "prompt": "Review @src",
  "model": "gpt-5.6-terra",
  "reasoningEffort": "high",
  "sandboxMode": "read-only",
  "approvalPolicy": "never",
  "strictConfig": true
}
```

If `model` is omitted, the server does not inject `-m`; Codex CLI remains the
source of truth. Explicit model names that are newer than this package are
passed through with a warning rather than blocked.

## Local model providers

Use Ollama or LM Studio through the dedicated options:

```json
{
  "prompt": "Explain @src",
  "localProvider": "ollama",
  "model": "qwen3:8b"
}
```

Local model names bypass the OpenAI known-model list. `localProvider` implies
`--oss`; with `exec resume`, the server uses the provider configuration because
that subcommand does not accept `--oss` or `--local-provider`.

## `mcp_servers`

Codex CLI can itself connect to MCP servers from `config.toml`:

```toml
[mcp_servers.example]
command = "npx"
args = ["-y", "example-mcp-server"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

HTTP MCP servers use a URL instead of a command:

```toml
[mcp_servers.docs]
url = "https://example.com/mcp"
```

Keep credentials in environment variables or the authentication mechanism
supported by the server. Do not commit secrets to project configuration.

## Automation safety

Current Codex CLI does not support `--full-auto`. For sandboxed,
non-interactive work, use:

```bash
codex --sandbox workspace-write --ask-for-approval never exec "..."
```

Within this MCP server, `sandbox: true` and `fullAuto: true` are compatibility
aliases for that pair. They do not disable sandboxing. `yolo: true` does disable
both sandboxing and approvals and should only be used inside an externally
hardened environment.
