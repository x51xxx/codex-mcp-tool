## FAQ

### OpenAI released a model called Codex in 2021 - is this related?

In 2021, OpenAI released Codex, an AI system designed to generate code from natural language prompts. That original Codex model was deprecated as of March 2023 and is separate from the CLI tool.

### Which models are supported?

Start with `gpt-6-astra` when quality matters, use `gpt-5.6-sol` or `gpt-5.6-terra` for everyday work, and use `gpt-5.6-luna` for clear, repeatable tasks. The default reasoning level is medium; increase it only when the task needs deeper planning or checking.

Available models:

- **gpt-6-astra** - Most capable model for complex, demanding work
- **gpt-5.6-sol** - Reliable agentic workhorse for everyday tasks
- **gpt-5.6-terra** - Balanced everyday coding and tool use
- **gpt-5.6-luna** - Fast, affordable, repeatable work
- **gpt-5.5** - Proven previous-generation fallback
- **gpt-5.4-mini** - Deprecated; Codex steers callers to `gpt-5.6-luna`

Use a concrete slug: the bare moving aliases `gpt-6` and `gpt-5.6` are rejected
with an HTTP 400.

You can also use specific models by launching codex with the `--model` flag.

### Why does my model not work for me?

It's possible that your [API account needs to be verified](https://help.openai.com/en/articles/10910291-api-organization-verification) in order to start streaming responses and seeing chain of thought summaries from the API. If you're still running into issues, please let us know!

### How do I stop Codex from editing my files?

By default, Codex can modify files in your current working directory (Auto mode). To prevent edits, run `codex` in read-only mode with the CLI flag `--sandbox read-only`. Alternatively, you can change the approval level mid-conversation with `/approvals`.

### Does it work on Windows?

Running Codex directly on Windows may work, but is not officially supported. We recommend using [Windows Subsystem for Linux (WSL2)](https://learn.microsoft.com/en-us/windows/wsl/install).
