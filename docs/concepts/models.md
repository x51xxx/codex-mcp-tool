# Model Selection

The Codex MCP Tool provides access to OpenAI's Codex CLI models optimized for software engineering tasks.

## Available Models

| Model             | Context  | Best For                                         | Notes                            |
| ----------------- | -------- | ------------------------------------------------ | -------------------------------- |
| **gpt-5.5**       | Extended | Complex coding, computer use, research workflows | Preferred default when available |
| **gpt-5.4**       | Extended | Professional coding and agentic workflows        | Primary fallback                 |
| **gpt-5.4-mini**  | Extended | Fast coding tasks and subagents                  | Lower latency and cost           |
| **gpt-5.3-codex** | Extended | Complex multi-file edits, architecture analysis  | Frontier coding model            |
| **gpt-5.2**       | Extended | General reasoning, broad knowledge               | Alternative general model        |

## How to Select a Model

### Using Codex CLI Directly

```bash
# Specify model with --model flag
codex --model gpt-5.5 "analyze @src/**/*.ts for performance issues"
codex --model gpt-5.4 "refactor @utils.js"
codex --model gpt-5.4-mini "quick review of @utils.js"
```

### Using MCP Tool (ask-codex)

```javascript
// Natural language
"use gpt-5.5 to analyze the entire codebase architecture"
"ask codex to solve this algorithm problem"
"quick check with gpt-5.4-mini on this function"

// Direct tool invocation
{
  "name": "ask-codex",
  "arguments": {
    "prompt": "analyze @src/core for optimization opportunities",
    "model": "gpt-5.5"
  }
}
```

### Using Brainstorm Tool

```javascript
{
  "name": "brainstorm",
  "arguments": {
    "prompt": "innovative features for our app",
    "model": "gpt-5.5",
    "methodology": "lateral"
  }
}
```

## Model Selection Guidelines

### By Task Type

#### Code Review & Analysis

- **Quick review**: gpt-5.4-mini (fast, efficient)
- **Comprehensive review**: gpt-5.5 (best quality when available)
- **Security audit**: gpt-5.5 (highest reliability)

#### Architecture & Design

- **System design**: gpt-5.5 (complex analysis)
- **API design**: gpt-5.4 (deep reasoning)
- **Quick prototypes**: gpt-5.4-mini (speed)

#### Bug Investigation

- **Complex bugs**: gpt-5.5 (thorough analysis)
- **Performance issues**: gpt-5.4 (balanced)
- **Simple fixes**: gpt-5.4-mini (quick turnaround)

#### Documentation

- **API docs**: gpt-5.5 (comprehensive)
- **Quick comments**: gpt-5.4-mini (efficient)
- **Architecture docs**: gpt-5.5 (thorough)

#### Refactoring

- **Large-scale**: gpt-5.5 (handles complexity)
- **Standard refactoring**: gpt-5.4 (balanced)
- **Simple cleanup**: gpt-5.4-mini (cost-effective)

## Cost Optimization Strategies

### 1. Start Small, Scale Up

```bash
# Initial exploration
codex --model gpt-5.4-mini "@src quick overview"

# Detailed analysis if needed
codex --model gpt-5.4 "@src comprehensive analysis"

# Deep dive for critical issues
codex --model gpt-5.5 "@src/critical solve complex bug"
```

### 2. Match Model to Task Complexity

```javascript
// Simple tasks - use mini model
{ "prompt": "add comments", "model": "gpt-5.4-mini" }

// Medium complexity - flagship model
{ "prompt": "refactor module", "model": "gpt-5.4" }

// High complexity - latest frontier
{ "prompt": "redesign architecture", "model": "gpt-5.5" }
```

## Performance Characteristics

### Response Times

- **gpt-5.4-mini**: Fast responses, optimized for speed and cost
- **gpt-5.4**: Balanced latency, strong reasoning
- **gpt-5.5**: Best quality for complex tasks
- **gpt-5.2**: Variable based on task type

### Reliability

- **gpt-5.5**: Latest frontier coding and agentic workflows
- **gpt-5.4**: Flagship professional coding work
- **gpt-5.3-codex**: Complex software engineering
- **gpt-5.4-mini**: Good for simple tasks and subagents
- **gpt-5.2**: Best as a general-reasoning fallback

## Setting Default Models

### Configuration File

In your Codex config (`~/.codex/config.toml`):

```toml
[defaults]
model = "gpt-5.5"
```

### Per-Request Override

```javascript
{
  "prompt": "analyze code",
  "model": "gpt-5.4-mini"  // Override default
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
gpt-5.5 → gpt-5.4 → gpt-5.4-mini → gpt-5.3-codex → gpt-5.2
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
  "model": "gpt-5.4-mini"
}
```

## Best Practices

1. **Start with gpt-5.4-mini** for initial exploration
2. **Use gpt-5.4** for deeper reasoning tasks
3. **Reserve gpt-5.5** for complex, critical tasks
4. **Consider gpt-5.2** for non-coding reasoning tasks
5. **Monitor costs** and optimize model selection

## See Also

- [How It Works](./how-it-works.md) - Understanding model integration
- [File Analysis](./file-analysis.md) - Optimizing file references for models
- [Sandbox Modes](./sandbox.md) - Security with different models
