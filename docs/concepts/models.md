# Model Selection

The Codex MCP Tool provides access to OpenAI's Codex CLI models optimized for software engineering tasks.

## Available Models

| Model                  | Context  | Best For                                        | Notes                            |
| ---------------------- | -------- | ----------------------------------------------- | -------------------------------- |
| **gpt-5.3-codex**      | Extended | Complex multi-file edits, architecture analysis | Default, latest frontier         |
| **gpt-5.2-codex**      | Extended | Complex coding tasks, architecture analysis     | Frontier agentic coding          |
| **gpt-5.1-codex-max**  | Extended | Deep reasoning, complex analysis                | Codex-optimized flagship         |
| **gpt-5.1-codex-mini** | Standard | Quick tasks, simple queries, cost-efficient     | Faster, but less capable         |
| **gpt-5.2**            | Extended | General reasoning, broad knowledge              | Latest frontier, general purpose |

## How to Select a Model

### Using Codex CLI Directly

```bash
# Specify model with --model flag
codex --model gpt-5.3-codex "analyze @src/**/*.ts for performance issues"
codex --model gpt-5.1-codex-max "refactor @utils.js"
codex --model gpt-5.1-codex-mini "quick review of @utils.js"
```

### Using MCP Tool (ask-codex)

```javascript
// Natural language
"use gpt-5.3-codex to analyze the entire codebase architecture"
"ask codex to solve this algorithm problem"
"quick check with gpt-5.1-codex-mini on this function"

// Direct tool invocation
{
  "name": "ask-codex",
  "arguments": {
    "prompt": "analyze @src/core for optimization opportunities",
    "model": "gpt-5.3-codex"
  }
}
```

### Using Brainstorm Tool

```javascript
{
  "name": "brainstorm",
  "arguments": {
    "prompt": "innovative features for our app",
    "model": "gpt-5.3-codex",
    "methodology": "lateral"
  }
}
```

## Model Selection Guidelines

### By Task Type

#### Code Review & Analysis

- **Quick review**: gpt-5.1-codex-mini (fast, efficient)
- **Comprehensive review**: gpt-5.3-codex (balanced)
- **Security audit**: gpt-5.3-codex (highest reliability)

#### Architecture & Design

- **System design**: gpt-5.3-codex (complex analysis)
- **API design**: gpt-5.1-codex-max (deep reasoning)
- **Quick prototypes**: gpt-5.1-codex-mini (speed)

#### Bug Investigation

- **Complex bugs**: gpt-5.3-codex (thorough analysis)
- **Performance issues**: gpt-5.1-codex-max (balanced)
- **Simple fixes**: gpt-5.1-codex-mini (quick turnaround)

#### Documentation

- **API docs**: gpt-5.3-codex (comprehensive)
- **Quick comments**: gpt-5.1-codex-mini (efficient)
- **Architecture docs**: gpt-5.3-codex (thorough)

#### Refactoring

- **Large-scale**: gpt-5.3-codex (handles complexity)
- **Standard refactoring**: gpt-5.1-codex-max (balanced)
- **Simple cleanup**: gpt-5.1-codex-mini (cost-effective)

## Cost Optimization Strategies

### 1. Start Small, Scale Up

```bash
# Initial exploration
codex --model gpt-5.1-codex-mini "@src quick overview"

# Detailed analysis if needed
codex --model gpt-5.1-codex-max "@src comprehensive analysis"

# Deep dive for critical issues
codex --model gpt-5.3-codex "@src/critical solve complex bug"
```

### 2. Match Model to Task Complexity

```javascript
// Simple tasks - use mini model
{ "prompt": "add comments", "model": "gpt-5.1-codex-mini" }

// Medium complexity - flagship model
{ "prompt": "refactor module", "model": "gpt-5.1-codex-max" }

// High complexity - latest frontier
{ "prompt": "redesign architecture", "model": "gpt-5.3-codex" }
```

## Performance Characteristics

### Response Times

- **gpt-5.1-codex-mini**: Fastest responses, optimized for speed
- **gpt-5.1-codex-max**: Balanced latency, deep reasoning
- **gpt-5.3-codex**: Latest frontier for complex tasks
- **gpt-5.2-codex**: Frontier agentic coding
- **gpt-5.2**: Variable based on task type

### Reliability

- **gpt-5.3-codex**: Latest frontier agentic coding
- **gpt-5.2-codex**: Frontier agentic coding
- **gpt-5.1-codex-max**: Codex-optimized flagship
- **gpt-5.1-codex-mini**: Good for simple tasks
- **gpt-5.2**: Best for general reasoning

## Setting Default Models

### Configuration File

In your Codex config (`~/.codex/config.toml`):

```toml
[defaults]
model = "gpt-5.3-codex"
```

### Per-Request Override

```javascript
{
  "prompt": "analyze code",
  "model": "gpt-5.1-codex-mini"  // Override default
}
```

### Local OSS Models

Use `oss: true` to run with a local model provider. Specify `localProvider` to choose between LM Studio and Ollama:

```javascript
// Auto-select local provider (config default or interactive selection)
{ "prompt": "analyze code", "oss": true }

// Explicitly use LM Studio
{ "prompt": "analyze code", "localProvider": "lmstudio" }

// Explicitly use Ollama (auto-enables --oss)
{ "prompt": "analyze code", "localProvider": "ollama" }
```

## Model Fallback Chain

The tool uses automatic fallback when a model is unavailable:

```
gpt-5.3-codex → gpt-5.2-codex → gpt-5.1-codex-max → gpt-5.2
```

## Troubleshooting

### Model Not Available

```bash
# Check available models
codex -m

# The tool will automatically fallback to available models
```

### Slow Responses

```javascript
// Switch to faster model
{
  "model": "gpt-5.1-codex-mini"
}
```

## Best Practices

1. **Start with gpt-5.1-codex-mini** for initial exploration
2. **Use gpt-5.1-codex-max** for deep reasoning tasks
3. **Reserve gpt-5.3-codex** for complex, critical tasks
4. **Consider gpt-5.2** for non-coding reasoning tasks
5. **Monitor costs** and optimize model selection

## See Also

- [How It Works](./how-it-works.md) - Understanding model integration
- [File Analysis](./file-analysis.md) - Optimizing file references for models
- [Sandbox Modes](./sandbox.md) - Security with different models
