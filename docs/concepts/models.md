# Model selection

The MCP server normally omits `--model`, so Codex CLI selects the model from
your account and `$CODEX_HOME/config.toml`. Pass `model` only when a task needs
a deliberate override.

This list was verified against Codex CLI `0.144.3` and its model cache on
2026-07-13. Availability still depends on account, workspace, and rollout.

## Recommended models

| Model           | Best for                             | Guidance                                   |
| --------------- | ------------------------------------ | ------------------------------------------ |
| `gpt-5.6-sol`   | Complex, open-ended, high-value work | Strongest default when quality matters     |
| `gpt-5.6-terra` | Everyday coding and tool use         | Balanced capability and cost               |
| `gpt-5.6-luna`  | Clear, repeatable, high-volume work  | Fastest and most affordable GPT-5.6 option |
| `gpt-5.5`       | Previous-generation frontier work    | Compatibility fallback                     |
| `gpt-5.4`       | Professional coding workflows        | Compatibility fallback                     |
| `gpt-5.4-mini`  | Small, well-scoped tasks             | Low-cost compatibility fallback            |

The official Codex guidance is to start with Sol when unsure, use Terra as the
everyday workhorse, and use Luna when the task is specific and success is easy
to verify.

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
codex exec -m gpt-5.6-sol "Review the current changes"
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
