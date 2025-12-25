# Changelog

## [1.5.0] - 2025-12-25

### Added

- **GPT-5.2 Model Family**: Latest frontier models (Codex CLI v0.60.0+)
  - `gpt-5.2-codex` - New default, latest frontier agentic coding model
  - `gpt-5.2` - Latest frontier model with broad knowledge and reasoning
  - Updated fallback chain: `gpt-5.2-codex` → `gpt-5.1-codex-max` → `gpt-5.2`

- **Reasoning Effort Control**: New `reasoningEffort` parameter for controlling reasoning depth
  - `low` - Fast responses with lighter reasoning
  - `medium` - Default, balances speed and reasoning depth
  - `high` - Greater reasoning depth for complex problems
  - `max` - Extra high reasoning depth for the most complex tasks
  - Available in both `ask-codex` and `brainstorm` tools

### Changed

- Default model: `gpt-5.1-codex-max` → `gpt-5.2-codex`
- Removed deprecated models: `gpt-5.1-codex`, `gpt-5.1`
- Updated model fallback chain for GPT-5.2 series

### Technical

- Added `REASONING_EFFORTS` constant in `constants.ts`
- Added `addReasoningEffort()` method in `CodexCommandBuilder`
- Updated `CodexExecOptions` and `CodexCommandBuilderOptions` interfaces
- Updated tool schemas for `ask-codex` and `brainstorm`
- Updated all documentation with new models and reasoning effort parameter

## [1.4.0] - 2025-11-26

### Added

- **Session Management**: Multi-turn conversation support with workspace isolation
  - `sessionId` parameter in ask-codex for conversation continuity
  - `resetSession` parameter to start fresh conversations
  - Sessions isolated by workspace (MD5 hash of repo:branch:path)
  - Configurable TTL via `CODEX_SESSION_TTL_MS` (default: 24 hours)
  - Maximum 50 sessions with automatic cleanup (`CODEX_MAX_SESSIONS`)

- **Native Codex Resume**: Integration with `codex resume` command (CLI v0.36.0+)
  - Automatic conversation ID extraction from Codex output
  - Seamless fallback to exec mode for older CLI versions

- **New Tools**:
  - `list-sessions`: View, delete, or clear active sessions
  - `health`: System diagnostics with feature detection, version info, and recommendations

- **Structured Error Handling**: 8 error categories with user-friendly messages
  - CLI_NOT_FOUND, AUTHENTICATION, RATE_LIMIT, TIMEOUT
  - SANDBOX, NETWORK, SESSION, UNKNOWN
  - Each error includes actionable solutions

### Changed

- Version caching: 5-minute cache for Codex CLI version checks (performance optimization)
- Error responses now include structured solutions and recommendations
- Tool registry expanded with session and diagnostics tools

### Technical

- Added `sessionStorage.ts`: In-memory session management with workspace isolation
- Added `errorTypes.ts`: Structured error classification and formatting
- Added `list-sessions.tool.ts`: Session management tool
- Added `health.tool.ts`: System health diagnostics tool
- Updated `versionDetection.ts`: Added RESUME feature detection and caching
- Updated `codexCommandBuilder.ts`: Resume mode support
- Updated `codexExecutor.ts`: codexConversationId option
- Updated `ask-codex.tool.ts`: Session management integration

## [1.3.0] - 2025-01-19

### Added

- **GPT-5.1 Model Family**: gpt-5.1-codex-max (new default), gpt-5.1-codex-mini, and variants
- **Native Search**: --search flag support with backward compatibility
- **Additional Directories**: addDirs parameter for multi-directory projects
- **Token Limit Control**: toolOutputTokenLimit parameter (100-10,000)
- **Version Detection**: Automatic Codex CLI version detection and compatibility
- **Model Detection**: Automatic model availability checking with fallback chain

### Changed

- Default model: gpt-5-codex → gpt-5.1-codex-max
- Search implementation: Dual-flag approach for compatibility

### Technical

- Added modelDetection.ts and versionDetection.ts utilities
- Enhanced CodexExecOptions interface
- Updated all tool schemas and documentation

## [1.2.4] - 2025-01-19

- Windows compatibility via cross-spawn
- Fixed "spawn codex ENOENT" errors on Windows

## [1.0.0]

- Public
- Basic Codex CLI integration
- Support for file analysis with @ syntax
- Sandbox mode support
