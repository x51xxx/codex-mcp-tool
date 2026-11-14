# Changelog

## [2.7.0] - 2026-11-14

Bug fixes from the 2026-11-14 code audit, verified against Codex CLI `0.169.0`.

### Fixed

- **debug/info logs went to stdout and corrupted the MCP stdio stream** once a client called `logging/setLevel debug`. Every level now goes to stderr.
- **Prompts starting with `-` failed** (`unexpected argument '- '`), e.g. a markdown list. The prompt now follows `--` in `exec`, `exec resume` and `review`.
- **Errors were misclassified:** Codex's stderr banner (`sandbox: read-only`) turned any failure — an unknown model included — into "Permission denied", and `401`/`429` matched inside session UUIDs. Only the `ERROR:` lines are classified now; precise causes are checked before the loose "error … model" wording ("rate limit reached for model X" was a Model Error), the broad `connect`/`session`/`expired` matches are gone, a client cancel gets its own "Request Cancelled" category, and arguments rejected by our own validation (unsupported reasoning effort, `yolo` + `fullAuto`, `ephemeral` + `sessionId`, …) are "Invalid Arguments" instead of "Unknown Error" with advice to run `codex login`.
- **Failures were reported as successes:** `❌ …` results now carry `isError: true` (ask-codex, review-changes, fetch-chunk, list-\*, health, failed do-act, all-failed batch).
- **Cancelled MCP requests left `codex` running** (and editing files) until its timeout. The request's abort signal now stops the child.
- **An invalid `workingDir` silently fell back** to another directory; it is now an error. `@path` inference now runs before `PWD` (it never ran before) and ignores `user@host/path`.
- **`brainstorm` returned a timed-out or truncated transcript as its answer** (`executeCodexCLI` partial-output salvage removed).
- **Sessions leaked across workspaces:** a `sessionId` reused in another directory resumed that directory's conversation. Sessions are now stored per (directory, `sessionId`), so the same ID in two directories is two independent conversations: neither resumes nor replaces the other, and a branch switch in the same directory keeps it. `list-sessions` shows each session's directory, and `delete` takes an optional `workingDir`. Resuming also silently switched to the config-default model; the session's model is now kept. The thread id is read only from a whole `session id:` line of stderr.
- **`fetch-chunk` path traversal:** `cacheKey` is validated; the cache moved to a per-user, owner-only directory with random keys.
- **Prompt text in logs:** command lines were logged at the default `warning` level with the full prompt; now debug-only and truncated. A map that kept the argv of failed spawns forever is gone.
- Prompts over 100 KB of UTF-8 (not characters) go over stdin — 100k Cyrillic characters exceeded Linux's 128 KiB argv limit.
- `timeout: 0` meant 10 minutes and a negative timeout killed Codex at once; timeouts must now be positive integers. stderr is capped at its last 1 MB; output overflow gets a SIGKILL fallback and is no longer reported as a timeout.
- `review-changes`: pins `-s read-only` (it is advertised read-only), escapes the model name, rejects `base`/`commit` values starting with `-`, and reports any failed run as a failure instead of "Code Review Results".
- `do-act`: the verify command gets the directory as `cwd` instead of interpolating it into the shell string; the fix prompt includes both stdout and stderr; retries resume the same Codex conversation; a cancel stops the loop.
- `batch-codex`: keeps its report when every task fails; `sandbox` is validated as an enum.
- changeMode: chunk requests no longer run Codex before rejecting a missing cache key; a longer fence (``) can wrap code containing `.
- Output parsing: an answer containing `--------` or "OpenAI Codex" is no longer mistaken for the interactive transcript and cut short.
- `health` checks authentication with `codex login status` (the old check passed whenever the CLI was installed) and spawns `codex --version` once.
- `image-gen`: a run that produced no image is reported with `isError`; an existing directory as `outputPath` works without a trailing slash; non-image files are ignored; truncated PNGs are handled.
- `list-skills` reads the frontmatter `description:` and also scans `.codex/skills`, `$CODEX_HOME/skills` and `~/.agents/skills`. `list-sessions` shows full session IDs.
- `sandbox: true` combined with an approval policy no longer fails with a fullAuto conflict; `fullAuto` + `yolo` is rejected.

### Changed

- Models synced with the 0.169.0 catalog: added `gpt-6.1-terra`; removed `gpt-5.5` (retired for ChatGPT sign-in on 2026-10-14; still passes through with API-key auth). `personality` accepts `none`.
- `timeout-test` is registered only with `CODEX_MCP_TEST_TOOLS=1`.
- `npm test` runs a `node --test` suite (39 tests, via `scripts/run-tests.mjs` so it works on Node 18+ and Windows); `prepublishOnly` runs lint + tests.

### Removed

- Unused `src/utils/reviewParser.ts`.

## [2.6.0] - 2026-09-30

### Changed

- **Model list synced with Codex CLI `0.159.2`** (`models_cache.json`, every slug checked with a live one-token run): added `gpt-6.1-sol` (latest workhorse), `gpt-6-sol` and `gpt-6-luna`; `gpt-5.6-*` and `gpt-5.5` stay as older/legacy options. `gpt-6.1-sol` needs a recent CLI — 0.157.1 rejects it with the same 400 an unknown slug gets. Reasoning map: Luna models stop at `max`, `gpt-5.5` at `xhigh`.

### Removed

- `gpt-5.4-mini` (`MODELS.GPT5_4_MINI`): withdrawn upstream; now returns HTTP 400 "not supported when using Codex with a ChatGPT account" on both 0.157.1 and 0.159.2.

### Added

- **`image-gen` tool**: generates or edits images through Codex's built-in `image_gen` tool (ChatGPT login, no API key). Builds a labeled prompt spec following Codex's `imagegen` skill (use case, asset type, style, composition, lighting, palette, verbatim text, reference roles, edit invariants, aspect ratio) plus presets (`photoreal`, `portrait`, `likeness`, `product`, `thumbnail`, `no-text`, `exact-text`, `brand-style`). Locates output deterministically via the `codex exec` thread id, copies it to `outputPath` without overwriting by default, and reports PNG dimensions and alpha.

## [2.4.0] - 2026-07-13

### Added

- **GPT-5.6 model family**: added `gpt-5.6`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`
- **New reasoning levels**: added model-dependent `max` and `ultra`; `ultra` may delegate work to subagents
- **Current Codex exec flags** for `ask-codex`:
  - `strictConfig` → `--strict-config`
  - `ephemeral` → `--ephemeral`
  - `ignoreUserConfig` → `--ignore-user-config`
  - `ignoreRules` → `--ignore-rules`
  - `bypassHookTrust` → `--dangerously-bypass-hook-trust`
- **CLI compatibility audit** documenting current commands, wrapped flags, intentional exclusions, security guidance, and remaining recommendations

### Changed

- Synced model recommendations with Codex CLI `0.144.3`: Sol for complex open-ended work, Terra for everyday work, and Luna for clear repeatable tasks
- `sandbox: true` and `fullAuto: true` now expand to `--sandbox workspace-write --ask-for-approval never`; the compatibility aliases keep sandboxing enabled
- Native `--search` is now used by itself on supported CLIs; deprecated `web_search_request` is only retained as a fallback for old versions
- Approval schemas and completions now expose only current values: `untrusted`, `on-request`, and `never`
- Renamed the case-sensitive MCP tool registration from `Help` to the documented `help`
- Updated the registered tool count to 13 and refreshed README, API examples, model, sandbox, configuration, and CLI documentation

### Fixed

- Removed generated `--full-auto` arguments, which current Codex CLI rejects
- Removed generated `on-failure` approval values, which current Codex CLI rejects
- Fixed object-form `config` overrides to emit repeatable `-c key=value` arguments instead of one invalid comma-joined value; nested objects now use dotted paths
- Fixed `sandbox: true` being ignored when `fullAuto: false` was explicitly present
- Rejected contradictory `ephemeral` plus `sessionId` requests because ephemeral sessions cannot provide MCP conversation continuity
- Fixed the `version` tool reporting hard-coded server version `2.1.1`; it now reads the package version at runtime
- Fixed `changeMode` parsing for fenced OLD/NEW blocks that include an info string such as `text` or `diff`

### Validation

- Verified command and flag parsing against Codex CLI `0.144.3`
- Passed TypeScript lint/build, VitePress documentation build, Prettier, MCP registry smoke test, and `git diff --check`

## [2.3.0] - 2026-05-01

### Added

- **GPT-5.5 and GPT-5.4-mini support**: Models list synced with Codex CLI v0.128.0 model catalogue
  - `gpt-5.5` — frontier model for complex coding, research, and agentic work (current Codex CLI default)
  - `gpt-5.4-mini` — small, fast, cost-efficient for simpler coding tasks
- **Per-tool reasoning calibration**: Default `reasoningEffort` tuned to each tool's typical workload
  - `brainstorm` → `high` (creative ideation benefits from depth)
  - `do-act` → `high` (act-check-fix loops converge faster with deeper reasoning)
  - `review-changes` → `high` + `reasoningEffort` parameter wired through (previously ignored)
- `.gitignore` entry for `.mcpregistry_*` token files

### Changed

- **`model` is now truly optional in every tool**: When omitted, the tool no longer probes a fallback chain — it simply doesn't pass `-m`, deferring to the default in `~/.codex/config.toml`. Saves ~5 s of startup latency per call and stops burning quota on availability tests.
- Tool descriptions for `model` rewritten to reflect the new behaviour ("Optional model override. If omitted, uses your Codex CLI default. Specify only to override.")
- `review-changes`: only injects `-c model="..."` when caller explicitly overrides the model
- README "Models" section rewritten to document config-default behaviour and per-tool reasoning calibration

### Removed

- **Retired models** (no longer in Codex CLI v0.128.0 model catalogue): `gpt-5.2-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, `gpt-5.3-codex-spark`
- **Dead model-detection code**: `getModelWithFallback`, `getDefaultModel`, `isModelAvailable`, `getAvailableModels` removed from `src/utils/modelDetection.ts`. Only `isValidModel` remains for soft-warning unknown model names.

## [2.2.0] - 2026-03-13

### Added

- **Response Mode**: New `responseMode` parameter for `ask-codex` tool
  - `clean` (default) — returns only the final answer
  - `full` — returns complete execution log including thinking, tool calls, agent activity, and final response
  - Gives master agents full visibility into Codex CLI reasoning and actions when needed

### Fixed

- **Empty responses with Codex CLI v0.114.0+**: Fixed critical output parsing bug
  - Codex CLI v0.114.0+ sends interactive output (header, metadata, thinking, tool executions) to stderr and only the clean final response to stdout
  - Old parser expected everything in stdout, causing empty `**Response:**` for complex queries
  - Parser now auto-detects clean stdout mode and extracts metadata/tokens from stderr
  - Falls back to stderr parsing when stdout is empty (e.g., long-running agent queries)
- **Aggressive content filtering in output parser**: Section markers (`codex`, `assistant`, `user`) now match only standalone lines, not content containing those words
  - Previously, any response line containing "codex" was silently filtered out
- **Missing section handling**: Added `user`, `exec`, `collab`, `mcp:`, `Plan`, `spawn_agent` as recognized sections to prevent content leaking between sections
- **Token parsing**: Now handles space-separated token counts (e.g., "7 951") and tokens without colon separator
- **stdout/stderr fallback in do-act and batch-codex**: These tools now fall back to stderr when stdout is empty

## [2.1.1] - 2026-03-06

### Fixed

- Error classification improvements and MCP registry metadata updates

## [2.1.0] - 2026-03-06

### Added

- **GPT-5.4**: New default model (latest frontier agentic coding model)
  - Updated fallback chain: `gpt-5.4` → `gpt-5.3-codex` → `gpt-5.2-codex` → `gpt-5.1-codex-max` → `gpt-5.2`

### Changed

- Default model: `gpt-5.3-codex` → `gpt-5.4`
- Server version aligned to `2.1.0` in both `package.json` and `index.ts`

## [2.0.0] - 2026-02-20

### Added

- **MCP Annotations**: `readOnlyHint`, `destructiveHint`, `idempotentHint` on all tools
- **Structured Output**: 6 tools return `structuredContent` alongside text
- **Completions**: Autocomplete for `model`, `methodology`, `reasoningEffort`, `sandboxMode`
- **New Tools**: `do-act` (act-check-fix loop), `list-skills` (skill listing)
- **New CLI Flags**: `--skip-git-repo-check`, `--output-schema`, `-o`
- **Personality Modes**: `pragmatic`, `friendly` communication styles

### Fixed

- Working directory resolution — `BuildResult` now exposes `workingDir`, passed as `cwd` to `spawn()`
- CLI flag ordering — `--skip-git-repo-check`, `--output-schema`, `-o` placed after `exec` subcommand

## [1.7.0] - 2026-02-06

### Added

- **Local OSS Model Support**: Run with Ollama or LM Studio instead of OpenAI
  - `localProvider` parameter (`"ollama"` or `"lmstudio"`) for `ask-codex` and `brainstorm`
  - Local model names (e.g. `qwen3:8b`) passed as-is, skipping OpenAI model validation
  - Sessions with resume work correctly via `-c model_provider=<provider>` fallback

### Changed

- Updated `AGENTS.md` with architecture notes and current tool list
- Updated `README.md` with Local OSS Models section and examples

## [1.6.0] - 2026-02-05

### Added

- **GPT-5.3-Codex**: New default model (latest frontier agentic coding model)
  - Updated fallback chain: `gpt-5.3-codex` → `gpt-5.2-codex` → `gpt-5.1-codex-max` → `gpt-5.2`

### Changed

- Default model: `gpt-5.2-codex` → `gpt-5.3-codex`

## [1.5.1] - 2026-01-15

### Changed

- Reasoning effort `max` renamed to `xhigh` to match Codex CLI/OpenAI API

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
