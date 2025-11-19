# Changelog

## [Unreleased]

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
