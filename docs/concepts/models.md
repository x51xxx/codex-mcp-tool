# Model selection

The MCP server normally omits `--model`, so Codex CLI selects the model from
your account and `$CODEX_HOME/config.toml`. Pass `model` only when a task needs
a deliberate override.

This list was verified against Codex CLI `0.159.2` and its model cache on
2026-09-30, with a live one-token run per slug. Availability still depends on account, workspace, and rollout.

## Recommended models

| Model           | Best for                            | Guidance                                   |
| --------------- | ----------------------------------- | ------------------------------------------ |
| `gpt-6.1-sol`   | Everyday coding and agentic work    | Latest workhorse; needs Codex CLI 0.159+   |
| `gpt-6-astra`   | Complex, demanding, high-value work | Frontier intelligence; use when it matters |
| `gpt-6-sol`     | Everyday work on an older CLI       | Previous-generation workhorse              |
| `gpt-6-luna`    | Clear, repeatable, high-volume work | Fast and affordable                        |
| `gpt-5.6-sol`   | Older-generation work               | Still available                            |
| `gpt-5.6-terra` | Straightforward work                | Older balanced model                       |
| `gpt-5.6-luna`  | Simple, well-scoped tasks           | Older fast, efficient model                |
| `gpt-5.5`       | Legacy compatibility                | Codex steers callers to `gpt-5.6-sol`      |

Reach for Astra when the problem is hard or open-ended, use Sol as the everyday
workhorse, and use Luna when the task is specific and success is easy to verify.

`gpt-6.1-sol` is rejected by Codex CLI 0.157.x with "not supported when using
Codex with a ChatGPT account" — the same 400 an unknown slug gets. Upgrade with
`npm install -g @openai/codex@latest`. `gpt-5.4-mini` was removed upstream.

Pass a concrete slug. The bare moving aliases `gpt-6` and `gpt-5.6` are not
accepted — the API rejects them with an HTTP 400.

## Reasoning effort

Supported MCP values are `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`.
The selected model and account determine which values are actually available.

- Start with `medium`.
- Use `low` for quick, tightly scoped tasks.
- Use `high` or `xhigh` for difficult multi-step work.
- Use `max` only for the hardest single-agent problems where latency matters less.
- Use `ultra` only when the task can benefit from automatic delegation to subagents.

Most tasks do not need `max` or `ultra`. In the verified CLI cache, Sol and
Terra expose both; Luna exposes `max` but not `ultra`.

## Examples

Direct CLI:

```bash
codex exec -m gpt-6-astra "Review the current changes"
codex exec -m gpt-5.6-terra "Refactor the request parser"
codex exec -m gpt-5.6-luna "Classify these build errors"
```

MCP invocation:

```json
{
  "prompt": "Audit @src for command-building regressions",
  "model": "gpt-5.6-sol",
  "reasoningEffort": "high"
}
```

For the default model, omit `model`:

```json
{
  "prompt": "Explain @src/utils/codexCommandBuilder.ts"
}
```

Set a persistent default in `$CODEX_HOME/config.toml`:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "medium"
```

## Local models

Local provider model names are passed through without OpenAI model validation:

```json
{
  "prompt": "Explain @src",
  "localProvider": "ollama",
  "model": "qwen3:8b"
}
```

There is no MCP-side automatic fallback chain. When no override is supplied,
Codex CLI remains the source of truth. An unknown explicit model is passed
through so newer rollouts and local providers are not blocked by this package.

See the [official Codex model guide](https://developers.openai.com/codex/models)
for current availability and recommendations.
