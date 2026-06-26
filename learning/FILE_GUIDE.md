# File Guide — What Each File Does

Read this with the repo open. Paths are relative to the project root.

---

## Public entry

### `src/index.ts`

**Role:** Package exports — the only surface most users import.

**Exports:** `createAgentSandbox`, `getSupportStatus`, `listPresets`, types, `WaboxError`.

**Learn:** This file should stay thin. No business logic here.

---

## Domain (`src/domain/`)

Pure data shapes and small utilities. No sandbox spawning.

### `src/domain/types.ts`

**Role:** TypeScript interfaces for the whole MVP API.

**Key types:**
- `AgentSandboxOptions` — what you pass to `createAgentSandbox`
- `WaboxPolicy` — filesystem, network, timeout overrides
- `Action`, `SessionLog`, `ExecResult` — logging and return values
- `SupportStatus` — output of `getSupportStatus()`
- `MirroredEnvInfo` — which tools/paths were discovered from the host

**Learn:** This is the contract between layers. Changing a field here ripples to policy builder, orchestrator, and tests.

### `src/domain/errors.ts`

**Role:** `WaboxError` class with codes like `EXEC_TIMEOUT`, `PLATFORM_UNSUPPORTED`.

**Learn:** Structured errors at boundaries — callers get `code` + `message` + optional `details` (e.g. stderr tail on timeout).

### `src/domain/path-utils.ts`

**Role:** `unionPaths()` deduplicates paths case-insensitively; `expandWorkspaceDenials()` for future `.env` deny rules.

**Learn:** Windows paths are messy (`C:/foo` vs `c:\foo`). Normalization prevents duplicate policy entries.

---

## Presets (`src/presets/`)

Named starting policies for common agent workflows.

### `src/presets/node-dev.ts`

**Role:** Defines the `node-dev` preset defaults: network blocked, 120s timeout, empty path lists (filled later by mirror).

**Constant:** `NODE_DEV_EXPECTED_TOOLS` — `node`, `npm`, `npx`, `git` for PATH detection.

### `src/presets/registry.ts`

**Role:** `getPreset('node-dev')` and `listPresets()`. MVP only registers one preset.

**Learn:** v1.1 will add `python-dev`, `definePreset()`, etc. here.

---

## Policy (`src/policy/`)

Translates human-friendly options into something MXC understands.

### `src/policy/build-policy.ts`

**Role:** **Core policy compiler.**

1. Load preset from registry
2. Merge user `policy` overrides
3. If `mirrorEnv` (default true): add MXC `getAvailableToolsPolicy()` readonly paths
4. Sanitize mirrored paths (drop drive roots — see `sanitize-paths.ts`)
5. Add `%TEMP%` via `getTemporaryFilesPolicy()`
6. If `workspacePath`: add to readwrite paths

**Output:** `ResolvedPolicy` + `MirroredEnvInfo`

**Learn:** This runs once per `createAgentSandbox()`, not per `exec()`.

### `src/policy/to-mxc-policy.ts`

**Role:** Converts `WaboxPolicy` → MXC `SandboxPolicy` (schema `0.7.0-alpha`).

**Special logic:** Sets `ui.allowWindows: true` when PowerShell is detected in the command.

**Learn:** Called on **every** `exec()` because the command string affects UI policy.

### `src/policy/shell-detect.ts`

**Role:** `commandRequiresWindowsUi()` — regex for `powershell` / `pwsh`.

**Why:** MXC blocks win32k UI by default; PowerShell needs `allowWindows` or it fails to start.

### `src/policy/sanitize-paths.ts`

**Role:** Removes overly broad paths from PATH mirror (e.g. `D:\`, `C:`).

**Why:** MXC DACL setup walks policy paths; a whole drive root makes spawns extremely slow or appear hung.

---

## Services (`src/services/`)

Orchestration — session creation and exec pipeline.

### `src/services/session-service.ts`

**Role:**
- `createSessionContext()` — validate platform, build policy, assign `sessionId`
- `createAgentSandboxInstance()` — exported as `createAgentSandbox`

**Learn:** Session is created in memory; nothing hits disk until `destroy()`.

### `src/services/exec-orchestrator.ts`

**Role:** Per-session exec pipeline:
1. Assign `actionId`, timestamp
2. Call `execInMxcSandbox()`
3. Record `Action` in memory
4. Return `ExecResult`

**Learn:** The action log lives here for the session lifetime. No disk until `destroy()`.

---

## Sandbox (`src/sandbox/`)

### `src/sandbox/agent-sandbox.ts`

**Role:** User-facing session object (`AgentSandbox` class).

**Methods:**
- `exec()` — delegate to orchestrator
- `getActionLog()` — live view of actions
- `destroy()` — write JSON session log, mark session dead

**Extends:** `EventEmitter` — hooks for future events (`approval-required`, etc.).

**Learn:** This is the “handle” agents hold for a sandbox session.

---

## Infrastructure (`src/infrastructure/`)

OS and MXC integration — the “sharp edges” layer.

### `src/infrastructure/mxc-constants.ts`

**Role:** Pin `MXC_SCHEMA_VERSION = '0.7.0-alpha'`, default log dir `.wabox/sessions`.

### `src/infrastructure/mxc-adapter.ts`

**Role:** **Actually runs commands in the sandbox.**

Flow:
1. `toMxcPolicy()` + `createConfigFromPolicy()`
2. Set `commandLine` (with Windows quoting helper)
3. `spawnSandboxFromConfig({ usePty: false })` → `wxc-exec.exe` child
4. Close stdin, collect stdout/stderr, wait for `close` or timeout
5. `WaboxError` on spawn failure / timeout

**Learn:** Most “hangs” and timeouts happen inside `wxc-exec`, not in this TypeScript file.

### `src/infrastructure/exec-log.ts`

**Role:** Debug logging when `WABOX_DEBUG=1`.

**Learn:** Use during diagnose/benchmark to see spawn phases without reading C++.

### `src/infrastructure/platform.ts`

**Role:** `getSupportStatus()` and `assertPlatformSupported()`.

Checks Node ≥ 18, Windows, MXC `getPlatformSupport()`. Caches platform probe (slow ~5s first call).

### `src/infrastructure/env-mirror.ts`

**Role:** Thin wrapper around `getAvailableToolsPolicy()` for future extension.

### `src/infrastructure/session-log-writer.ts`

**Role:** Atomic JSON write — temp file + rename to `{logDir}/{sessionId}.json`.

---

## Scripts (`scripts/`)

Runnable tools, not imported by the library.

| File | Purpose |
|------|---------|
| `mxc-spike.ts` | Phase 0 raw MXC test (node + PowerShell) |
| `diagnose-mxc.ts` | Step-by-step health check before benchmark |
| `benchmark-wabox-vs-docker.ts` | Performance comparison harness |

---

## Examples (`examples/`)

### `examples/minimal-agent.ts`

**Role:** Smallest end-to-end usage: create sandbox → exec → destroy.

---

## Tests (`tests/`)

| File | What it tests |
|------|----------------|
| `policy/build-policy.test.ts` | Policy merge, MXC version, quoting |
| `policy/sanitize-paths.test.ts` | Drive root filtering |
| `policy/session-log-writer.test.ts` | Atomic JSON write |
| `integration/sandbox.test.ts` | Real MXC spawn (gated by `WABOX_INTEGRATION=1`) |

---

## Docs (`docs/`)

| File | Purpose |
|------|---------|
| `DECISIONS.md` | ADRs (schema version, ESM, one-shot exec) |
| `MVP_LIMITATIONS.md` | Honest scope boundaries |
| `BENCHMARK.md` | WABOX vs Docker methodology |

---

## Config (root)

| File | Purpose |
|------|---------|
| `package.json` | npm scripts, MXC dependency |
| `tsconfig.json` | Compile `src/` → `dist/` |
| `vitest.config.ts` | Test runner |
| `WABOX_SPEC.md` | Full product specification |
| `AGENTS.md` | Cursor agent instructions for this repo |
