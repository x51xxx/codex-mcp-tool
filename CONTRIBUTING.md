# Contributing to Codex MCP Tool

Thank you for your interest in contributing to Codex MCP Tool! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We aim to maintain a welcoming environment for all contributors.

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/x51xxx/codex-mcp-tool/issues) to avoid duplicates
2. Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
3. Include:
   - Clear description of the issue
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node.js version, OS, Codex CLI version)
   - Error messages and logs

### Suggesting Features

1. Check [existing feature requests](https://github.com/x51xxx/codex-mcp-tool/issues?q=is%3Aissue+label%3Aenhancement)
2. Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
3. Explain the problem your feature solves
4. Provide use cases and examples

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes following our coding standards
4. Test your changes thoroughly
5. Submit a pull request using our [PR template](.github/pull_request_template.md)

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- Yarn >= 1.22.0
- Codex CLI installed and authenticated
- TypeScript knowledge

### Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/codex-mcp-tool.git
cd codex-mcp-tool

# Install dependencies
yarn install

# Build the project
yarn build

# Run locally
yarn start

# Development mode (build + run)
yarn dev

# Type checking
yarn lint

# Format code
yarn format
```

### Testing with MCP Clients

#### Claude Code

```bash
# Build and link local development version
yarn build
yarn link

# Add to Claude Code
claude mcp add codex-dev --npm-package @trishchuk/codex-mcp-tool
```

#### Claude Desktop

Add to your configuration:

```json
{
  "mcpServers": {
    "codex-dev": {
      "command": "node",
      "args": ["/path/to/your/codex-mcp-tool/dist/index.js"]
    }
  }
}
```

## Coding Standards

### TypeScript Guidelines

- Use TypeScript strict mode
- Define types for all function parameters and returns
- Use Zod schemas for runtime validation in all tools
- Follow ESM module conventions (use `.js` extensions in imports)
- Use 2-space indentation, single quotes preferred
- File naming: kebab-case (e.g., `fetch-chunk.tool.ts`)
- Never commit secrets or API keys

### Tool Development Guidelines

- All tools must implement the `UnifiedTool` interface
- Use descriptive zod schema validation with `.describe()`
- Include optional progress callbacks for long-running operations
- Handle errors gracefully and return meaningful messages
- Follow the naming pattern: `toolName.tool.ts`
- Export tools as `export const toolNameTool: UnifiedTool`

### File Structure

```
src/
├── tools/                    # Tool implementations
│   ├── *.tool.ts            # Individual tools
│   ├── registry.ts          # Tool registry types
│   └── index.ts             # Tool registration
├── utils/                    # Utility functions
│   ├── codexExecutor.ts     # Codex CLI executor
│   ├── sessionStorage.ts    # Session management
│   ├── versionDetection.ts  # CLI version detection
│   ├── errorTypes.ts        # Structured error handling
│   ├── changeModeRunner.ts  # Change mode processor
│   └── logger.ts            # Logging utilities
├── constants.ts              # Project constants
└── index.ts                 # Main MCP server
```

### Adding a New Tool

1. Create `src/tools/your-tool.tool.ts`:

```typescript
import { z } from 'zod';
import { UnifiedTool } from './registry.js';

const yourToolArgsSchema = z.object({
  param: z.string().describe('Parameter description'),
});

export const yourTool: UnifiedTool = {
  name: 'your-tool',
  description: 'Tool description',
  zodSchema: yourToolArgsSchema,
  prompt: {
    description: 'Tool prompt description',
  },
  category: 'utility',
  execute: async (args, onProgress) => {
    onProgress?.('Processing...');
    return 'Tool result';
  },
};
```

2. Register in `src/tools/index.ts`:

```typescript
import { yourTool } from './your-tool.tool.js';

toolRegistry.push(yourTool);
```

3. Add documentation in `docs/api/tools/your-tool.md`

### Commit Messages

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

Examples:

```
feat: add session management for multi-turn conversations
fix: honor explicit sessionId in getOrCreateSession
docs: update installation instructions for Windows
```

## Testing

### Running Tests

```bash
# Type checking
yarn lint

# Build verification
yarn build

# Run tests (when available)
yarn test

# Format check
yarn format:check
```

### Manual Testing Checklist

Before submitting a PR, test:

- [ ] All tools work correctly with their documented parameters
- [ ] ask-codex tool handles file references (@filename syntax)
- [ ] Session management works with multiple sessionIds per workspace
- [ ] changeMode returns structured OLD/NEW blocks
- [ ] Error handling returns user-friendly messages
- [ ] Progress notifications appear for long operations
- [ ] Documentation builds successfully (`yarn docs:build`)
- [ ] No TypeScript errors (`yarn lint`)

## Documentation

### Updating Documentation

Documentation uses VitePress:

```bash
# Start docs dev server
yarn docs:dev

# Build documentation
yarn docs:build

# Preview built docs
yarn docs:preview
```

### Documentation Structure

```
docs/
├── index.md              # Homepage
├── getting-started.md    # Installation & setup
├── api/tools/            # Tool-specific documentation
├── concepts/             # Conceptual guides
├── examples/             # Usage examples
└── resources/            # FAQ, troubleshooting
```

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit: `git commit -m "chore: release v1.4.x"`
4. Tag: `git tag v1.4.x`
5. Push: `git push origin main --tags`

The CI/CD pipeline will publish to npm as `@trishchuk/codex-mcp-tool`.

## Getting Help

- Check [documentation](https://x51xxx.github.io/codex-mcp-tool/)
- Ask in [GitHub Discussions](https://github.com/x51xxx/codex-mcp-tool/discussions)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
