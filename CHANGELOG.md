# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-20

### Changed

- **Migrated to the OpenCode V2 plugin API** (`@opencode/plugin@^2.1.1`, requires OpenCode v2.1+).
  V1 plugins do not run in V2, so this is a breaking release for V1 users.
- Plugin entrypoint is now `Plugin.define({ id: "opencode-arise", setup(ctx) })`.
- Agents are registered through `ctx.agent.transform`, tools through `ctx.tool.transform`.
- Hooks now use the V2 domain hooks:
  - `tool.execute.after` → `ctx.tool.hook("execute.after", ...)`
  - `experimental.session.compacting` → `ctx.session.hook("compaction", ...)`
  - the returned `event` hook → `ctx.event.subscribe()`
- Background tasks now use `ctx.session.wait` / `ctx.session.context` instead of
  `session.status` polling and `promptAsync`.
- Shadow permissions use V2 rules (`{ action, resource, effect }`) instead of the
  V1 `permission` map; `options.reasoningEffort` moved to `request.body`.
- CLI installer now writes the V2 `plugins` array (still supports/updates legacy
  `plugin` configs).
- `bun run build` now emits `dist/tui.js` and keeps `@opencode/plugin`/`zod` external.

### Added

- Optional TUI plugin entrypoint (`opencode-arise/tui`) that restores the
  "ARISE!" toast, since V2 server plugins have no TUI notification API.

### Fixed

- Shadow agents are now created via `editor.update`, which creates missing agents
  in V2 (`Agent.Info.default`).

## [0.1.5] - 2025-01-12

### Fixed

- Exclude cover images from npm package (1.4 MB → 98 KB)
- Only include `assets/arise-banner.txt`, not full assets folder

## [0.1.4] - 2025-01-12

### Fixed

- CI workflow: Build before test (fixes build.test.ts requiring dist/)
- Release workflow: Pure OIDC Trusted Publishing

## [0.1.3] - 2025-01-12

### Added

- Comprehensive test suite (68 tests) covering:
  - Module exports validation (prevents export bugs)
  - Build output verification
  - Plugin integration tests
  - All custom tools and hooks
  - Config schema validation
  - JSONC parser edge cases

### Fixed

- Test for banner ASCII art spacing

## [0.1.2] - 2025-01-12

### Fixed

- **Critical**: Remove named exports that OpenCode was incorrectly treating as plugin instances
- Only default export the plugin function now

## [0.1.1] - 2025-01-12

### Fixed

- CLI installer now handles complex JSONC config files with URLs, escaped quotes, and multi-line comments
- Better error messages when config parsing fails

## [0.1.0] - 2025-01-11

### Added

- Initial release of opencode-arise
- Shadow Army agents:
  - `monarch` - Primary orchestrator (Sung Jinwoo)
  - `beru` - Fast codebase scout (Ant King)
  - `igris` - Precise implementation (Loyal Knight)
  - `bellion` - Strategic planning (Grand Marshal)
  - `tusk` - UI/UX specialist
  - `tank` - External research
  - `shadow-sovereign` - Deep reasoning (Full Power)
- Custom tools for shadow delegation:
  - `arise_summon` - Invoke shadows sync/async
  - `arise_background` - Launch parallel background tasks
  - `arise_background_output` - Get background task results
  - `arise_background_status` - List background tasks
  - `arise_background_cancel` - Cancel running tasks
- Hooks:
  - `arise-banner` - Session start toast
  - `output-shaper` - Quality-safe output truncation
  - `compaction-preserver` - Preserve critical context
  - `todo-enforcer` - Incomplete TODO reminders
- CLI installer (`bunx opencode-arise install`)
- Configuration system with project/global config support
