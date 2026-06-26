# WABOX Architecture (MVP)

WABOX is a **thin TypeScript wrapper** around Microsoft's MXC SDK. It turns low-level sandbox policy into an agent-friendly API: `createAgentSandbox` → `exec` → `destroy`.

## Layer diagram

```text
┌─────────────────────────────────────────────────────────────┐
│  PUBLIC API          src/index.ts                           │
│  createAgentSandbox · getSupportStatus · listPresets        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  SESSION / SANDBOX   sandbox/agent-sandbox.ts                 │
│                      services/session-service.ts              │
│  User-facing session object, lifecycle, destroy + log         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  SERVICES            services/exec-orchestrator.ts            │
│  Timing, action IDs, in-memory action log per session         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  POLICY              policy/build-policy.ts                   │
│                      policy/to-mxc-policy.ts                  │
│                      presets/*                                │
│  Presets + overrides → WaboxPolicy → MXC SandboxPolicy        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  INFRASTRUCTURE      infrastructure/mxc-adapter.ts            │
│                      infrastructure/platform.ts               │
│                      infrastructure/session-log-writer.ts     │
│  Spawn wxc-exec, platform checks, write JSON logs to disk     │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  MXC SDK             @microsoft/mxc-sdk                       │
│  wxc-exec.exe → Windows processcontainer / AppContainer+DACL  │
└─────────────────────────────────────────────────────────────┘
```

## Domain layer (`src/domain/`)

Pure types and helpers — **no I/O, no MXC imports**. Safe to unit test without Windows sandbox.

## Why one-shot exec per command?

MVP uses MXC's **one-shot spawn** model: each `sandbox.exec()` launches a new `wxc-exec` process. Shell state (`cd`, env vars set in a prior command) does **not** carry over unless written to the workspace filesystem.

Stateful multi-exec sessions are planned for v2 (`isolation_session` backend).

## Dependency rule

Code should only import **inward**:

`index` → `sandbox` / `services` → `policy` / `presets` → `domain`  
`infrastructure` is called from `services` and `sandbox`, not from `domain`.
