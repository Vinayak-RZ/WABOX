# WABOX — Windows Agent Sandbox
### Complete Product Specification & Architecture

**Status:** Pre-development · Open Source · MIT License  
**Version:** Spec v0.1  
**Underlying primitive:** `@microsoft/mxc-sdk` (Public Preview, schema `0.7.0-alpha`)  
**Runtime requirement:** Node.js ≥ 18, Windows 11 24H2+ (build 26100)

---

## Table of Contents

1. [Vision](#1-vision)
2. [Problem Statement](#2-problem-statement)
   - 2.1 The Native Windows Gap
   - 2.2 What Agents Actually Need
   - 2.3 The OpenAI Codex Lesson
   - 2.4 What Developers Actually Want (from real usage)
3. [What WABOX Is and Is Not](#3-what-wabox-is-and-is-not)
4. [Architecture Overview](#4-architecture-overview)
5. [Core Concepts](#5-core-concepts)
6. [Dependency: MXC SDK](#6-dependency-mxc-sdk)
7. [Public API Design](#7-public-api-design)
8. [Preset System](#8-preset-system)
   - 8.1 Built-in Presets
   - 8.2 Preset Composition
   - 8.3 Custom Presets
   - 8.4 Environment Mirror Mode
   - 8.5 Credential & Config Injection
9. [Action Tracking System](#9-action-tracking-system)
10. [Eval System](#10-eval-system)
11. [Network Restriction Layer](#11-network-restriction-layer)
12. [Risk-Gated Execution](#12-risk-gated-execution)
    - 12.1 Risk Classification
    - 12.2 Approval Flow
    - 12.3 Dev Server & Localhost Port Access
13. [One-Click Setup](#13-one-click-setup)
    - 13.1 npx wabox setup
    - 13.2 npx wabox setup --network-strict
    - 13.3 npx wabox doctor
    - 13.4 npx wabox teardown
    - 13.5 npx wabox trace (Diagnostic Mode)
14. [v1 — Core](#14-v1--core)
15. [v2 — Hardened & Observable](#15-v2--hardened--observable)
16. [v3 — Swarm & Orchestration](#16-v3--swarm--orchestration)
17. [Known Limitations & Honest Caveats](#17-known-limitations--honest-caveats)
18. [Open Questions](#18-open-questions)

---

## 1. Vision

AI agents on Windows run commands, write files, call APIs, and spawn processes — with little to no enforcement boundary between them and the host machine. The standard answer has been to force Windows developers into WSL2, which adds friction, breaks native toolchains, and wasn't designed for agentic workloads.

**WABOX is a TypeScript/Node.js library that gives any AI agent a safe, observable, configurable native Windows execution environment in as few lines of code as possible.**

It wraps Microsoft's MXC SDK with agent-specific concerns: prebuilt policy presets for common dev workflows, a structured action log for every command the agent runs, a basic eval system to assess agent behavior, and a network restriction layer that goes beyond what MXC provides natively on Windows.

The goal is not to compete with MXC. WABOX is the developer-experience layer on top of it — the thing that makes the right thing the easy thing for anyone building or deploying AI agents on Windows.

---

## 2. Problem Statement

### 2.1 The Native Windows Gap

Most AI coding tools (Cursor, Claude Code, GitHub Copilot) default to WSL2 + Linux Bubblewrap on Windows because native Windows sandboxing primitives were not designed for open-ended agentic workloads:

- **AppContainer** — capability-based, requires knowing all access needs upfront. Cannot handle dynamic agentic workflows (arbitrary shells, package managers, build tools).
- **Windows Sandbox** — disposable VM, strong isolation, but requires host/guest bridging, setup overhead, and is unavailable on Windows Home SKUs.
- **Mandatory Integrity Control** — modifying integrity labels affects the entire filesystem trust model on the host, not just the sandboxed process.
- **MXC (processcontainer)** — the most promising primitive, but ships without fine-grained network filtering on Windows, no action observability, no agent-friendly API, and no presets.

### 2.2 What Agents Actually Need

A sandbox for an AI agent is different from a sandbox for a browser tab or a UWP app. An agent:

- Runs unpredictable command sequences based on model output
- Needs read access to the real project, not a copy
- Must be observable — what did it do, did it succeed, was anything risky?
- May run sub-tasks that should be independently bounded
- Needs network access for some things (npm registry, PyPI) but not others (arbitrary internet)
- Must integrate with minimal boilerplate so agent developers actually use it

### 2.3 The OpenAI Codex Lesson

OpenAI's blog on building the Codex Windows sandbox is instructive. Their first unelevated prototype used proxy environment variables (`HTTPS_PROXY=http://127.0.0.1:9`, etc.) to block network — but they explicitly called this "advisory" because any process implementing its own socket code would bypass it. They ultimately redesigned around dedicated Windows users and Windows Firewall rules (requiring elevation) to get real network enforcement.

This shapes WABOX's network design: v1 ships a proxy-based approach with honest documentation of its limitations; v2 implements the elevated Windows Firewall approach.

### 2.4 What Developers Actually Want (from real usage)

Real developers using AI coding agents don't primarily worry about zero-day sandbox escapes or side-channel attacks. What they actually want, based on observed usage patterns, is much more practical:

**1. Their real environment, not a second one.**
Developers do not want to maintain a separate environment for the sandboxed agent. They want the agent to see the same Node.js, Python, Git, and tools they use — at the same paths. Having to replicate a dev environment inside a sandbox is friction that kills adoption.

**2. Direct access to the actual project files.**
Not a copy. The agent and the developer's IDE should be looking at the same directory simultaneously. This is how "run the agent, then immediately inspect what it changed in VS Code" works — which is how most developers actually use these tools.

**3. Network access to start a local server.**
A very common agent workflow is: install dependencies → build → start a dev server → verify it responds on localhost. Blocking all network without an escape hatch for localhost breaks this entirely.

**4. A way to inject credentials without them leaking.**
Agents need auth tokens to call APIs. Developers want to inject credentials into the sandbox so the agent can use them, but without those credentials being modifiable or saveable by the agent. The goal is: agent can read `ANTHROPIC_API_KEY`, cannot exfiltrate it by writing it to a file outside the workspace.

**5. Blast radius reduction, not a hardened security boundary.**
Most developers are comfortable with advisory sandboxing for their use case. The actual threat model is: *the agent messes up something accidentally* (deletes the wrong files, installs a rogue package, commits garbage to git). It is not: *a nation-state actor exploits a kernel zero-day through the model output*. WABOX should be designed and communicated around the real threat model.

**6. A debugging path when something breaks.**
When the agent fails because it can't access a file or tool it needs, developers need to know *why* — what was blocked, what path was attempted. Without this, debugging sandbox policy is painful trial-and-error.

WABOX's design answers all six of these directly, on native Windows, without requiring WSL2 or Docker.

---

## 3. What WABOX Is and Is Not

### WABOX Is:
- A **Windows-native** TypeScript/Node.js library, installable via npm
- An agent-friendly wrapper around `@microsoft/mxc-sdk`
- A **blast radius reducer** — it limits accidental damage from misbehaving agents, not a hardened security product
- A preset library that **mirrors the developer's real Windows environment** — same tools, same paths, zero re-configuration
- A mechanism for agents to access the **actual project directory** directly (not a copy)
- A **credential injection** layer — agents can use secrets without being able to persist changes to them
- A **dev server / localhost** support layer — agents can bind ports accessible from the host
- An action tracking system (structured log of every agent command)
- A basic behavioral eval system
- A network restriction layer (advisory in v1, OS-enforced in v2)
- A risk-gating mechanism for flagging high-risk agent commands
- A **diagnostic trace tool** for understanding why something broke in the sandbox

### WABOX Is Not:
- A replacement for MXC — it depends on MXC
- A task planner or agent orchestrator
- A model wrapper or LLM client
- A hardened security product — do not rely on it as your only defence against malicious model output
- **Bubblewrap for Windows** — WABOX is not a port of Linux sandboxing primitives. It is a Windows-native tool that achieves the same *developer outcomes* using Windows-native mechanisms (MXC, processcontainer, Windows Firewall)
- A Linux/macOS sandbox — Windows-first; Linux/macOS may work via MXC's native backends but are explicitly not the target
- A multi-environment manager — the whole point is you do not need a separate environment

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT CODE                               │
│   (Claude Code / Codex / Custom Agent / Any Node.js Agent)      │
└────────────────────────────┬────────────────────────────────────┘
                             │  import { createAgentSandbox }
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WABOX LAYER                              │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │   Preset    │  │   Tracker    │  │    Network Proxy       │  │
│  │   System    │  │   + Eval     │  │    (v1: advisory)      │  │
│  │             │  │              │  │    (v2: OS-enforced)   │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬────────────┘  │
│         │                │                      │               │
│         └────────────────┴──────────────────────┘               │
│                          │                                      │
│                  ┌───────▼────────┐                             │
│                  │  Policy Builder │                             │
│                  │  + Risk Gate   │                             │
│                  └───────┬────────┘                             │
└──────────────────────────┼──────────────────────────────────────┘
                           │  createConfigFromPolicy()
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MXC SDK LAYER                               │
│              (@microsoft/mxc-sdk v0.6.0-alpha)                  │
│                                                                 │
│   spawnSandboxFromConfig() / execInSandboxAsync()               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  WINDOWS OS LAYER                               │
│         processcontainer backend (Windows 11 24H2+)             │
│         [v2: windows_sandbox / isolation_session backends]      │
└─────────────────────────────────────────────────────────────────┘
```

### 4.1 Layer Responsibilities

**Preset System** — Translates named presets (`node-dev`, `python-dev`, etc.) into MXC `SandboxPolicy` objects. Handles platform quirks like the PowerShell `ui.allowWindows` requirement automatically.

**Tracker + Eval** — Wraps every `sandbox.exec()` call. Records command, timing, exit code, stdout/stderr, and any policy flags. Computes risk scores and session summaries.

**Network Proxy** — In v1, starts a local HTTP/HTTPS proxy and injects proxy environment variables into the MXC sandbox. Enforces domain allowlists/blocklists at the proxy level. In v2, replaced or supplemented by Windows Firewall rules via the elevated setup step.

**Policy Builder** — Merges presets, user overrides, and network policy into a final MXC `SandboxPolicy`. Handles the `cwd`-does-not-grant-access quirk, the PowerShell UI flag, and other known MXC gotchas.

**Risk Gate** — Inspects each command before execution. Assigns a risk level. Emits an event for high-risk commands and optionally blocks execution pending approval.

---

## 5. Core Concepts

### Session
A session is a single `createAgentSandbox()` lifecycle: creation → one or more `exec()` calls → `destroy()`. Each session has a unique ID, a policy, an action log, and an eval report.

### Policy
The set of rules governing what an agent can do: which filesystem paths are readable/writable/denied, whether network is allowed, whether GUI is allowed, timeout limits. WABOX compiles policies from presets and user overrides; MXC enforces them.

### Preset
A named, pre-built policy template for a common agent workflow. Presets encode institutional knowledge about what that workflow actually needs, including platform quirks MXC doesn't handle for you.

### Action
A single `exec()` call made by the agent inside a session. Captured as a structured record in the action log.

### Risk Level
A heuristic classification assigned to each action: `low`, `medium`, `high`, `critical`. Based on command pattern matching, not semantic understanding of the agent's intent.

### Eval Report
A per-session summary computed after `destroy()`: success rate, risk distribution, policy violations, anomalies, and a plain-text summary.

### Environment Mirror
The default behaviour of all WABOX presets: auto-discover the developer's real Windows tools (Node.js, Python, Git, PATH binaries) and expose them inside the sandbox at their actual host paths. The agent sees the same environment the developer uses. No manual path specification required.

### Credential Injection
A mechanism for providing secrets (API keys, tokens, config files) to the sandbox as read-only snapshots. The agent can read them; it cannot persist changes back to the host. Injected values are never written to the session log.

### Dev Server
A sandboxed process that binds a localhost port. Because `processcontainer` is process isolation (not a VM or network namespace), localhost ports bound inside the sandbox are reachable from the host by default. WABOX makes this explicit and configurable via `ports` options.

---

## 6. Dependency: MXC SDK

WABOX is a wrapper, not a replacement. Understanding what MXC does and does not provide is essential.

### What MXC Provides (relevant to WABOX)

- `processcontainer` backend: stable, Windows 11 24H2+ (build 26100), no elevation required
- Filesystem policy: `readonlyPaths`, `readwritePaths`, `deniedPaths`
- Network on/off: `network.defaultPolicy: 'allow' | 'block'`
- Proxy routing: `network.proxy`
- UI access control: `ui.allowWindows`
- Policy discovery helpers: `getAvailableToolsPolicy`, `getTemporaryFilesPolicy`, `getUserProfilePolicy`
- Schema version: use `0.6.0-alpha` for new code

### What MXC Does NOT Provide on Windows (WABOX's job to fill)

- Fine-grained network filtering (no `allowedHosts` / `blockedHosts` enforcement on Windows)
- Action logging / observability
- Risk assessment
- Agent-friendly API (presets, exec abstraction)
- Eval / reporting
- PowerShell auto-fix (requires knowing to set `ui.allowWindows: true`)

### Version Pinning

WABOX pins a specific MXC schema version in its policy builder. When MXC ships a new stable schema, WABOX explicitly adopts it as a tracked upgrade, not automatically. This protects WABOX users from silent MXC breaking changes during the preview period.

---

## 7. Public API Design

All types are TypeScript. WABOX is a named-export ESM package.

### 7.1 Entry Point

```ts
import {
  createAgentSandbox,
  listPresets,
  getSupportStatus,
} from 'wabox';
```

### 7.2 createAgentSandbox()

```ts
async function createAgentSandbox(options: AgentSandboxOptions): Promise<AgentSandbox>
```

```ts
interface AgentSandboxOptions {
  // Identity
  agentId?: string;              // Logged in action records. e.g. 'claude-code', 'my-agent'
  sessionLabel?: string;         // Human-readable label for this session

  // Policy
  preset?: PresetName | PresetName[];   // 'node-dev' | 'python-dev' | 'read-only' | etc.
  policy?: Partial<WaboxPolicy>;        // Overrides merged on top of preset(s)

  // Environment mirroring (default: true for all presets)
  // When true, WABOX auto-discovers real Windows tools via MXC's getAvailableToolsPolicy()
  // and exposes them inside the sandbox at their actual host paths.
  mirrorEnv?: boolean;

  // Credential & config injection
  // Files or env vars injected as read-only snapshots. Agent can read, cannot modify host.
  inject?: InjectionOptions;

  // Network
  network?: NetworkOptions;

  // Dev server / localhost port access
  ports?: PortOptions;

  // Risk gating
  riskGate?: RiskGateOptions;

  // Tracking
  tracking?: TrackingOptions;

  // Output
  logDir?: string;               // Where session logs are written. Default: .wabox/sessions/
}
```

### 7.3 AgentSandbox (the session object)

```ts
interface AgentSandbox {
  // Core execution
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;

  // Session state
  readonly sessionId: string;
  readonly agentId: string | undefined;
  readonly policy: ResolvedPolicy;
  readonly mirroredEnv: MirroredEnvInfo;   // What tools were discovered and exposed

  // Action log access (live, during session)
  getActionLog(): ActionLog;

  // Events
  on(event: 'action:complete',     handler: (action: Action) => void): this;
  on(event: 'approval-required',   handler: (pending: PendingAction) => void): this;
  on(event: 'policy-violation',    handler: (violation: PolicyViolation) => void): this;
  on(event: 'dev-server:ready',    handler: (info: DevServerInfo) => void): this;
  on(event: 'session:error',       handler: (err: WaboxError) => void): this;

  // Teardown
  destroy(): Promise<EvalReport>;   // Destroys sandbox, returns final eval report
}

interface MirroredEnvInfo {
  readonlyPathsAdded: string[];      // Paths auto-added from tool discovery
  toolsFound: string[];              // e.g. ['node', 'npm', 'git', 'python']
  toolsNotFound: string[];           // Tools in preset that weren't detected on host
}

interface DevServerInfo {
  port: number;
  hostUrl: string;                   // e.g. 'http://localhost:3000' — accessible from host
}
```

### 7.4 exec()

```ts
interface ExecOptions {
  cwd?: string;                  // Working directory inside sandbox
  env?: Record<string, string>;  // Additional env vars (merged into sandbox env)
  timeoutMs?: number;            // Override session-level timeout for this command
  label?: string;                // Human label for this action (e.g. 'install dependencies')
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  actionId: number;              // ID of the action in the session log
  risk: RiskLevel;               // WABOX's risk assessment for this command
  policyFlags: PolicyFlag[];     // Any policy-adjacent events detected
}
```

### 7.5 Policy Types

```ts
interface WaboxPolicy {
  filesystem: {
    readonlyPaths?: string[];
    readwritePaths?: string[];
    deniedPaths?: string[];
    workspacePath?: string;      // Shorthand: grants readwrite to this dir, readonly to its .git
  };
  ui: {
    allowWindows?: boolean;      // Auto-set to true when running PowerShell (WABOX handles this)
  };
  timeoutMs?: number;
  allowShell?: ('powershell' | 'cmd' | 'bash')[];
}
```

### 7.6 Network Options

```ts
interface NetworkOptions {
  mode: 'block' | 'allow' | 'allowlist' | 'blocklist';

  // Used when mode is 'allowlist' or 'blocklist'
  domains?: string[];

  // v1: proxy-based enforcement (advisory — documented limitation)
  // v2: windows-firewall enforcement (requires elevated setup)
  enforcement?: 'proxy' | 'firewall';  // Default: 'proxy' in v1
}
```

### 7.7 Injection Options

```ts
interface InjectionOptions {
  // Inject individual environment variables as read-only values.
  // These are set in the sandbox env but cannot be written back to host.
  // NEVER logged in action records.
  env?: Record<string, string>;

  // Inject host files as read-only snapshots inside the sandbox.
  // The agent can read them at the sandboxPath; writes are discarded.
  // Changes made inside the sandbox do NOT propagate back to the host file.
  files?: FileInjection[];
}

interface FileInjection {
  hostPath: string;      // Absolute path on the host, e.g. 'C:/Users/Dev/.claude.json'
  sandboxPath: string;   // Where the agent sees it, e.g. 'C:/Users/Dev/.claude.json'
                         // (same path is fine — it's a read-only snapshot, not a bind-mount)
}
```

**Example — inject Claude credentials so the agent can call the API, but cannot persist changes:**

```ts
const sandbox = await createAgentSandbox({
  preset: 'node-dev',
  inject: {
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    },
    files: [
      {
        hostPath: 'C:/Users/Dev/.claude.json',
        sandboxPath: 'C:/Users/Dev/.claude.json',
      },
    ],
  },
});
// Agent can read ANTHROPIC_API_KEY and .claude.json.
// Any writes to .claude.json inside the sandbox are discarded.
// The key is never written to the session log.
```

### 7.8 Port Options

```ts
interface PortOptions {
  // Ports the agent is allowed to bind inside the sandbox.
  // Since processcontainer is process isolation (not a VM), localhost ports are
  // reachable from the host by default — this option makes that intent explicit
  // and enables the 'dev-server:ready' event.
  allow?: number[];

  // Emit 'dev-server:ready' when the agent binds one of these ports.
  watchFor?: number[];
}
```

**Example — agent starts a dev server on port 3000:**

```ts
const sandbox = await createAgentSandbox({
  preset: 'node-dev',
  network: { mode: 'allow' },   // Agent needs outbound for npm install
  ports: {
    allow: [3000],
    watchFor: [3000],
  },
});

sandbox.on('dev-server:ready', (info) => {
  console.log(`Dev server ready at ${info.hostUrl}`);
  // Open browser, run e2e tests, etc.
});

await sandbox.exec('npm install');
await sandbox.exec('npm run dev');   // Starts server on :3000
```

```ts
interface RiskGateOptions {
  enabled: boolean;                        // Default: true
  autoBlock: RiskLevel[];                  // Risk levels that auto-block without event
  requireApproval: RiskLevel[];            // Risk levels that emit 'approval-required'
  approvalTimeoutMs?: number;              // Auto-deny if no approval within this window
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
```

### 7.10 Minimal Integration Example

```ts
import { createAgentSandbox } from 'wabox';

// Absolute minimum — works immediately
// mirrorEnv: true by default, so real Node/npm/git are auto-discovered
const sandbox = await createAgentSandbox({ preset: 'node-dev' });

const r1 = await sandbox.exec('npm install');
const r2 = await sandbox.exec('node build.js');

const report = await sandbox.destroy();
console.log(report.summary);
```

### 7.11 Full Integration Example

```ts
import { createAgentSandbox } from 'wabox';

const sandbox = await createAgentSandbox({
  agentId: 'my-coding-agent',
  sessionLabel: 'Build task — fix auth bug',

  preset: ['node-dev'],
  mirrorEnv: true,   // default — auto-discovers real tools from host

  policy: {
    filesystem: {
      workspacePath: 'C:/Users/Dev/myproject',
      deniedPaths: ['C:/Users/Dev/myproject/.env'],
    },
  },

  // Inject API key and Claude config as read-only snapshots
  inject: {
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
    files: [
      { hostPath: 'C:/Users/Dev/.claude.json', sandboxPath: 'C:/Users/Dev/.claude.json' },
    ],
  },

  network: {
    mode: 'allowlist',
    domains: ['registry.npmjs.org', 'github.com'],
    enforcement: 'proxy',
  },

  // Agent may start a dev server — we want to know when it's ready
  ports: { allow: [3000, 8080], watchFor: [3000, 8080] },

  riskGate: {
    enabled: true,
    autoBlock: ['critical'],
    requireApproval: ['high'],
    approvalTimeoutMs: 30_000,
  },

  tracking: {
    enabled: true,
    logDir: '.wabox/sessions',
  },
});

sandbox.on('approval-required', async (pending) => {
  const approved = await myAgent.askUser(`Approve command: ${pending.command}?`);
  pending.resolve(approved);
});

sandbox.on('dev-server:ready', (info) => {
  console.log(`Server accessible from host at ${info.hostUrl}`);
});

sandbox.on('policy-violation', (v) => {
  console.warn('Policy violation:', v);
});


const result = await sandbox.exec('npm install', { label: 'Install deps' });
const report = await sandbox.destroy();

console.log('Session complete:', report.summary);
console.log('Success rate:', report.stats.successRate);
console.log('Risk profile:', report.stats.riskDistribution);
```

---

## 8. Preset System

Presets answer two questions simultaneously: "what does an agent doing X need access to?" and "what does the developer's real Windows environment look like?" They are not sanitised subsets — they are **mirrors of the actual host environment**, scoped to what a given workflow legitimately needs.

All presets enable `mirrorEnv: true` by default. This calls MXC's `getAvailableToolsPolicy(process.env)` under the hood, which discovers tools from the host's `PATH`, `PYTHONPATH`, `JAVA_HOME`, and other standard environment variables, then exposes them at their real host paths inside the sandbox. The developer does not need to specify tool locations manually. If the developer has Node 22.x installed at `C:/Program Files/nodejs`, the agent sees it there — not at some sandbox-internal location.

The agent and the developer's IDE see the **same files at the same paths**. This is intentional and is how developers actually want to work: run the agent, flip to VS Code, see what changed.

### 8.1 Built-in Presets

#### `node-dev`
For agents doing Node.js/npm development.

```
Filesystem readonly:  node/npm binaries, global node_modules, PATH tools
Filesystem readwrite: %TEMP%, workspace (if workspacePath set)
Filesystem denied:    .env files (configurable)
Network default:      block (agent should set domains explicitly)
UI:                   allowWindows auto-applied for shell commands
Timeout:              120s default
```

#### `python-dev`
For agents doing Python/pip development.

```
Filesystem readonly:  python, pip binaries, PYTHONPATH, venv dirs
Filesystem readwrite: %TEMP%, workspace
Network default:      block
Timeout:              120s default
```

#### `full-dev`
Union of node-dev + python-dev. For agents that span multiple runtimes.

```
Filesystem readonly:  node, python, git binaries, PATH tools
Filesystem readwrite: %TEMP%, workspace
Network default:      block
Timeout:              300s default
```

#### `read-only`
For agents that inspect code but must not modify anything or make network calls.

```
Filesystem readonly:  workspace, PATH tools
Filesystem readwrite: %TEMP% only
Network:              block (hard, not configurable via this preset)
Timeout:              60s default
```

#### `offline`
Like full-dev but with no network under any configuration.

```
Filesystem:           same as full-dev
Network:              block (hard-coded, ignores network options)
Timeout:              300s default
```

#### `git-only`
For agents that only need to run git commands.

```
Filesystem readonly:  git binary, workspace
Filesystem readwrite: workspace (git writes), %TEMP%
Filesystem denied:    workspace/.codex, workspace/.agents (protect agent dirs)
Network default:      block
```

### 8.2 Preset Composition

Multiple presets merge in order; later presets' paths are unioned with earlier ones. Explicit `policy` overrides win over any preset value.

```ts
// Union of node-dev + python-dev paths, plus a custom denied path
const sandbox = await createAgentSandbox({
  preset: ['node-dev', 'python-dev'],
  policy: {
    filesystem: { deniedPaths: ['C:/Users/Dev/project/.secrets'] }
  }
});
```

### 8.3 Custom Presets

Developers can define and register custom presets:

```ts
import { definePreset, createAgentSandbox } from 'wabox';

definePreset('my-rust-dev', {
  filesystem: {
    readonlyPaths: ['C:/Users/Dev/.cargo', 'C:/Program Files/Rust'],
    readwritePaths: ['%TEMP%'],
  },
  timeoutMs: 600_000,
});

const sandbox = await createAgentSandbox({ preset: 'my-rust-dev' });
```

---

## 9. Action Tracking System

Every `exec()` call is intercepted and recorded before being sent to MXC. The action log is the source of truth for everything the agent did in a session.

### 9.1 Session Log Schema

```ts
interface SessionLog {
  sessionId: string;
  agentId: string | undefined;
  sessionLabel: string | undefined;
  startedAt: string;             // ISO 8601
  endedAt: string | undefined;
  preset: string | string[];
  policy: ResolvedPolicy;
  actions: Action[];
}
```

### 9.2 Action Schema

```ts
interface Action {
  id: number;                    // Sequential within session, starts at 1
  sessionId: string;
  timestamp: string;             // ISO 8601, when exec() was called
  label: string | undefined;     // Human label from ExecOptions
  command: string;               // Full command string as passed to exec()
  cwd: string | undefined;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;

  // WABOX assessments
  risk: RiskLevel;
  riskReasons: string[];         // Why this risk level was assigned
  policyFlags: PolicyFlag[];
  networkAttempts: NetworkAttempt[];  // v1: proxy-detected; v2: firewall-detected

  // State at time of exec
  approvalState: 'not-required' | 'approved' | 'denied' | 'auto-blocked' | 'timed-out';
}
```

### 9.3 Policy Flags

```ts
type PolicyFlag =
  | 'DENIED_PATH_ATTEMPT'          // Command tried to access a denied path
  | 'OUTSIDE_WORKSPACE'            // Command targeted a path outside the workspace
  | 'HIGH_RISK_COMMAND'            // Command matched a high-risk pattern
  | 'NETWORK_BLOCKED'              // Network call was blocked by proxy/firewall
  | 'NETWORK_ALLOWED_DOMAIN'       // Network call to an allowlisted domain was permitted
  | 'NETWORK_UNLISTED_DOMAIN'      // Network call to a domain not on allowlist was attempted
  | 'TIMEOUT_EXCEEDED'             // Command hit the timeout limit
  | 'SENSITIVE_PATH_READ'          // Read of a sensitive-looking path (.env, credentials, etc.)
  | 'PROCESS_SPAWN_DETECTED';      // Command tried to spawn a subprocess (detectable cases)
```

### 9.4 Log Persistence

By default, session logs are written to `.wabox/sessions/<sessionId>.json` relative to the process cwd. The `logDir` option changes this. Logs are written atomically on session `destroy()`. Live access during the session is in-memory only.

---

## 10. Eval System

The eval system computes a structured report from the session's action log. It is intentionally scoped to *behavioral and mechanical* evaluation — it does not assess whether the agent completed its task correctly, which requires task-level context WABOX does not have.

### 10.1 What Eval Measures

| Metric | Description | How |
|---|---|---|
| Success rate | % of actions with exitCode 0 | Count exitCode === 0 / total actions |
| Risk distribution | Count of actions per risk level | Count by `action.risk` |
| Policy violation count | Total actions with any policyFlag | Count actions where policyFlags.length > 0 |
| Blocked actions | Actions blocked by risk gate | Count by `approvalState` |
| Network summary | Domains attempted, blocked, allowed | Aggregate `networkAttempts` |
| Session duration | Total time from start to destroy | `endedAt - startedAt` |
| Anomaly flags | Patterns that look unusual | See 10.2 |

### 10.2 Anomaly Detection (v1)

Anomaly detection in v1 is heuristic pattern matching, not AI analysis. Patterns flagged:

- `EXFILTRATION_PATTERN` — outbound network call combined with file read in same command
- `PRIVILEGE_ESCALATION_PATTERN` — attempt to run commands as a different user
- `RECURSIVE_DELETE` — command matching `rm -rf`, `del /s /q`, `Remove-Item -Recurse`
- `AGENT_DIR_TAMPER` — attempt to read/write `.codex`, `.agents`, `.wabox` directories
- `UNUSUAL_BINARY` — execution of a binary not in the original preset's readonly paths
- `RAPID_FIRE` — more than N commands in M seconds (configurable, default: 10 in 5s)

### 10.3 EvalReport Schema

```ts
interface EvalReport {
  sessionId: string;
  agentId: string | undefined;
  sessionLabel: string | undefined;
  generatedAt: string;

  stats: {
    totalActions: number;
    successRate: number;                  // 0.0 – 1.0
    failureRate: number;
    avgDurationMs: number;
    totalDurationMs: number;
    riskDistribution: Record<RiskLevel, number>;
    policyViolations: number;
    blockedActions: number;
    anomaliesDetected: number;
  };

  network: {
    totalAttempts: number;
    blocked: number;
    allowed: number;
    domainsAttempted: string[];
    domainsBlocked: string[];
  };

  anomalies: Anomaly[];
  highRiskActions: Action[];             // All actions with risk 'high' or 'critical'

  // Plain text, human-readable
  summary: string;

  // Machine-readable verdict
  verdict: 'clean' | 'review-recommended' | 'suspicious' | 'blocked';
}
```

### 10.4 Example Eval Output

```
WABOX Session Eval Report
═══════════════════════════════════════
Session:     wabox-abc123
Agent:       my-coding-agent
Label:       Build task — fix auth bug
Duration:    4m 12s

Actions:     23 total
  ✓ Success: 20 (87%)
  ✗ Failed:   2 (9%)
  ⊘ Blocked:  1 (4%)

Risk Profile:
  Low:      18
  Medium:    4
  High:      1
  Critical:  0

Network:
  Attempts:  8
  Allowed:   6 (registry.npmjs.org, github.com)
  Blocked:   2 (pastebin.com → ALLOWLIST_VIOLATION)

Anomalies:   1
  ⚠ RAPID_FIRE — 12 commands in 3.2s (action IDs 14–25)

Verdict: REVIEW-RECOMMENDED

High-risk actions:
  [18] rm -rf node_modules  (approved by user, exitCode 0)
═══════════════════════════════════════
```

---

## 11. Network Restriction Layer

### 11.1 v1 — Proxy-Based (Advisory)

WABOX starts a lightweight local HTTP/HTTPS proxy when network options are configured. The proxy is injected into the MXC sandbox environment via:

```
HTTPS_PROXY=http://127.0.0.1:<wabox-proxy-port>
HTTP_PROXY=http://127.0.0.1:<wabox-proxy-port>
ALL_PROXY=http://127.0.0.1:<wabox-proxy-port>
GIT_HTTPS_PROXY=http://127.0.0.1:<wabox-proxy-port>
NO_PROXY=localhost,127.0.0.1,::1
GIT_SSH_COMMAND=cmd /c exit 1
```

The proxy enforces domain rules before forwarding:

- **`mode: 'block'`** — Proxy rejects all outbound requests (returns 403)
- **`mode: 'allow'`** — Proxy passes all outbound requests through
- **`mode: 'allowlist'`** — Proxy only forwards to domains in the `domains` list; blocks all others
- **`mode: 'blocklist'`** — Proxy blocks domains in the `domains` list; forwards all others

All network attempts (blocked or allowed) are logged as `NetworkAttempt` records on the action.

**⚠ Documented Limitation:** This is advisory enforcement. Any process that implements its own TCP/IP socket calls, ignores proxy environment variables, or uses a non-proxy-aware protocol will bypass this layer. This is the same limitation OpenAI encountered in their first Codex Windows sandbox prototype. It handles the common cases (npm, pip, git HTTPS, curl, fetch) but is not an OS-enforced boundary. For OS-enforced network restriction, use v2's `enforcement: 'firewall'` mode (requires elevated setup).

### 11.2 v2 — Windows Firewall Enforcement (OS-Enforced)

Implemented in v2. Requires one-time elevated (admin) setup.

The approach (informed by OpenAI's Codex sandbox design):

1. `wabox setup --network-strict` creates two dedicated local Windows users: `WaboxSandboxOffline` and `WaboxSandboxOnline`
2. Windows Firewall outbound rules are created for `WaboxSandboxOffline` that block all outbound traffic
3. WABOX's MXC sandbox is launched as the appropriate user depending on the session's network mode
4. For `allowlist` mode, a WABOX-controlled proxy is still used (now running as a different user from the sandbox), with the firewall permitting outbound only to the proxy process's port
5. Credentials for the sandbox users are encrypted with DPAPI and stored where the sandbox users cannot read them

This gives real OS-level network enforcement regardless of whether the sandboxed process respects environment variables.

**Requirements for v2 network firewall mode:**
- One-time `wabox setup --network-strict` run with admin privileges
- Windows 11 24H2+ (same as base requirement)
- Does not require elevation for each subsequent sandbox session

---

## 12. Risk-Gated Execution

### 12.1 Risk Classification

Every command is classified before execution using a pattern-matching rule set.

```
CRITICAL — commands WABOX will auto-block by default (configurable):
  - rm -rf / (or any root-level recursive delete)
  - format <drive>
  - reg delete (registry deletion)
  - Overwrite of system32 or Program Files
  - curl/wget piped to sh/powershell (pipe-to-execute patterns)

HIGH — commands that require approval by default:
  - rm -rf <any path> (recursive delete of any directory)
  - del /s /q <path>
  - Remove-Item -Recurse
  - Any command writing to paths outside the declared workspace
  - Attempts to modify PATH, PATHEXT, or shell profile files

MEDIUM — commands logged and flagged but permitted:
  - npm install, pip install (network-touching package installs)
  - git push, git clone
  - Any exec() of a downloaded binary
  - Commands with sudo or runas

LOW — normal dev workflow commands:
  - npm run, node, python, pytest, cargo, dotnet
  - git add, git commit, git status, git diff
  - read-only file operations (cat, type, Get-Content)
  - echo, print
```

### 12.2 Approval Flow

When a command hits a risk level configured for `requireApproval`, WABOX emits `approval-required` and pauses execution until the handler calls `pending.resolve(true|false)` or the timeout expires.

```ts
sandbox.on('approval-required', async (pending) => {
  // pending.command   — the full command string
  // pending.risk      — the risk level
  // pending.riskReasons — why it was flagged
  // pending.resolve(bool) — approve or deny

  const approved = await promptUser(`Approve: ${pending.command}?`);
  pending.resolve(approved);
});
```

If no `approval-required` handler is registered and the risk gate is enabled, WABOX defaults to auto-deny for `requireApproval` levels (safe default).

---

## 13. One-Click Setup

### 13.1 npx wabox setup

```bash
npx wabox setup
```

This is the entry point for new users. It:

1. Checks Node.js version (≥ 18 required)
2. Checks Windows build (24H2 / build 26100 minimum)
3. Installs `@microsoft/mxc-sdk` and its native binary
4. Verifies `getPlatformSupport().isSupported === true`
5. Runs a smoke test: spawns a minimal sandbox, runs `echo wabox-ok`, verifies exit code 0
6. Creates a `.wabox/` config directory in the project (or globally with `--global`)
7. Writes a `wabox.config.json` with detected defaults
8. Prints a summary of what's available and what's not

```
WABOX Setup
════════════════════════════
✓ Node.js 22.1.0 (≥ 18 required)
✓ Windows 11 26100 (24H2+)
✓ MXC SDK 0.6.0-alpha installed
✓ processcontainer backend available
✓ Smoke test passed

Network:
  proxy-based filtering    ✓ available
  firewall enforcement     ✗ not configured (run: npx wabox setup --network-strict)

Experimental backends:
  windows_sandbox          ✓ detected (requires --experimental flag)
  isolation_session        ✗ requires Windows Insider build 26300+

Config written to: .wabox/wabox.config.json

Ready. Install wabox: npm install wabox
════════════════════════════
```

### 13.2 npx wabox setup --network-strict

Elevated mode. Prompts for UAC, then:

1. Creates `WaboxSandboxOffline` and `WaboxSandboxOnline` Windows users
2. Encrypts their credentials with DPAPI
3. Creates Windows Firewall outbound block rules for `WaboxSandboxOffline`
4. Verifies firewall rules are correct
5. Updates `wabox.config.json` to enable `enforcement: 'firewall'`

### 13.3 npx wabox doctor

Diagnostic command. Checks all prerequisites, installed components, and config validity. Useful for debugging when `createAgentSandbox()` fails.

### 13.4 npx wabox teardown

Removes everything WABOX created at the OS level:
- Deletes `WaboxSandboxOffline` and `WaboxSandboxOnline` users (if created)
- Removes WABOX firewall rules
- Does NOT remove `.wabox/` logs or config (user data)

---

## 14. v1 — Core

**Goal:** Ship a minimal, working, agent-friendly sandbox layer. Validate the MXC wrapper approach. Get feedback.

### Feature List

| Feature | Description |
|---|---|
| `createAgentSandbox()` | Core API with options described in §7 |
| Presets | `node-dev`, `python-dev`, `full-dev`, `read-only`, `offline`, `git-only` |
| Preset composition | Multiple presets merged, user policy overrides |
| Custom presets | `definePreset()` API |
| Action tracking | Full `Action` records per `exec()` call |
| Session log | Written to disk on `destroy()` |
| Basic eval | Stats, risk distribution, network summary, plain-text summary |
| Anomaly detection | 6 heuristic patterns from §10.2 |
| Risk classification | 4-level classification with default rule set |
| Risk-gated execution | `approval-required` event, auto-block for critical |
| Network — proxy mode | HTTP/HTTPS proxy enforcement, allowlist/blocklist |
| PowerShell auto-fix | Auto-sets `ui.allowWindows: true` for shell commands |
| `npx wabox setup` | Prerequisite checking and smoke test |
| `npx wabox doctor` | Diagnostic command |
| `getSupportStatus()` | Programmatic check before calling `createAgentSandbox()` |
| TypeScript types | Full type definitions shipped |
| Documentation | README, preset docs, known limitations clearly listed |

### v1 Non-Goals (explicitly deferred)

- Windows Firewall network enforcement (v2)
- Session snapshots / checkpointing (v2)
- State-aware sandbox lifecycle (`isolation_session` backend) (v2)
- Sub-agent / swarm orchestration (v3)
- AI-powered eval (v3)

### v1 Success Criteria

- Any agent developer can go from zero to a working sandboxed session in under 10 minutes
- A coding agent (e.g. a simple Claude Code script) can run inside WABOX with zero changes other than swapping `exec()` calls
- The action log + eval report are useful for debugging a failed agent session
- All limitations are documented, none are hidden

---

## 15. v2 — Hardened & Observable

**Goal:** Harden the network layer. Improve observability. Add support for longer-lived agentic sessions.

### 15.1 Windows Firewall Network Enforcement

See §11.2. Adds `enforcement: 'firewall'` option. Requires one-time `wabox setup --network-strict`.

This closes the biggest gap v1 leaves open: network restriction that cannot be bypassed by raw socket code.

### 15.2 State-Aware Session Lifecycle

MXC's `isolation_session` backend (currently Insider Preview, expected to stabilize) enables provision-once, exec-many sessions. WABOX exposes this when available:

```ts
const sandbox = await createAgentSandbox({
  preset: 'node-dev',
  sessionMode: 'stateful',    // Uses isolation_session if available, falls back to one-shot
});

// Multiple execs in the same sandbox instance (shared state between commands)
await sandbox.exec('npm install');
await sandbox.exec('npm run build');
await sandbox.exec('npm test');

// State is preserved between exec() calls in stateful mode
```

In v1, each `exec()` is a one-shot spawn (state is NOT preserved between calls unless the agent manages it explicitly). v2's stateful mode enables true multi-step sessions where earlier commands affect later ones.

### 15.3 Session Snapshots

The ability to checkpoint and branch from a session state. Useful for agents that explore multiple solution paths.

```ts
const snap = await sandbox.snapshot('after-install');

await sandbox.exec('npm run build:variant-a');
const reportA = await sandbox.destroy();

// Branch from the snapshot
const sandbox2 = await snap.restore();
await sandbox2.exec('npm run build:variant-b');
const reportB = await sandbox2.destroy();
```

Implementation note: in v1's one-shot mode, a "snapshot" is really a policy + action log checkpoint, not a true filesystem snapshot. Full filesystem snapshotting requires the `isolation_session` or `windows_sandbox` backend (both experimental in v1 timeframe).

### 15.4 Enhanced Network Observability

With the firewall enforcement in place, WABOX can capture richer network data:

- Which process within the sandbox made the network attempt (not just which command)
- Exact domains and ports attempted
- Bytes sent/received (where the OS exposes this)

This enriches the action log's `networkAttempts` field and the eval report's network summary.

### 15.5 Eval Improvements

- **Trend analysis** — compare current session eval against past sessions for the same agentId
- **Baseline detection** — flag when a session's risk profile significantly deviates from the agent's historical baseline
- **Export formats** — JSON, Markdown summary, JUnit-compatible XML (for CI integration)

### 15.6 Custom Risk Rules

Allow developers to define their own risk patterns:

```ts
import { defineRiskRule } from 'wabox';

defineRiskRule({
  id: 'no-git-push',
  level: 'high',
  reason: 'Agent attempted to push to remote',
  match: (command) => /git push/.test(command),
});
```

---

## 16. v3 — Swarm & Orchestration

**Goal:** Enable multi-agent / sub-agent architectures where multiple sandboxes coordinate under shared policies and a unified session view.

### 16.1 Swarm Sessions

A swarm session is a parent session that coordinates multiple child sandboxes. Each child is a full WABOX sandbox with its own policy (which can inherit from or extend the parent).

```ts
import { createSwarmSession } from 'wabox';

const swarm = await createSwarmSession({
  agentId: 'orchestrator',
  sharedPolicy: {
    filesystem: { workspacePath: 'C:/Dev/project' },
    network: { mode: 'allowlist', domains: ['npmjs.org'] },
  },
});

// Spawn child sandboxes (each isolated from each other)
const workerA = await swarm.spawnChild({ label: 'test-runner', preset: 'node-dev' });
const workerB = await swarm.spawnChild({ label: 'linter',      preset: 'node-dev' });
const workerC = await swarm.spawnChild({ label: 'type-checker', preset: 'node-dev' });

await Promise.all([
  workerA.exec('npm test'),
  workerB.exec('npm run lint'),
  workerC.exec('npx tsc --noEmit'),
]);

const swarmReport = await swarm.destroy();
// swarmReport contains per-child eval + aggregate summary
```

### 16.2 Shared Workspace

A controlled mechanism for multiple child sandboxes to read from and write to a shared directory, with conflict detection:

```ts
const shared = swarm.createSharedWorkspace('C:/Dev/project/output');

workerA.mountSharedWorkspace(shared, { mode: 'readwrite' });
workerB.mountSharedWorkspace(shared, { mode: 'readwrite' });
// WABOX detects if two workers write to the same file simultaneously and emits 'conflict'
```

### 16.3 Policy Inheritance

Child sandbox policies can inherit from the swarm's shared policy and extend or restrict it:

```ts
const child = await swarm.spawnChild({
  preset: 'node-dev',
  policy: {
    // Inherits shared policy, then applies these overrides
    filesystem: {
      deniedPaths: ['C:/Dev/project/src/auth'],  // This child can't touch auth module
    },
    network: { mode: 'block' },  // This child gets no network even though swarm allows npm
  },
});
```

### 16.4 Aggregate Eval

The swarm session's eval report aggregates across all child sessions:

- Per-child breakdown
- Cross-child anomalies (e.g. two children writing the same file, rapid spawning patterns)
- Total resource usage across the swarm
- Overall swarm verdict

### 16.5 Risk Escalation Chain

In a swarm, a child's `approval-required` event can be escalated to the swarm orchestrator, which can have its own handler. If the orchestrator approves, it is logged as an orchestrator-level approval (not a per-child approval).

### 16.6 AI-Powered Eval (Experimental)

An optional eval mode that sends the session action log + task description to a model to produce a semantic eval: did the agent's behavior match the stated goal? This requires an API key and opt-in, and produces non-deterministic output. Clearly labelled as experimental.

```ts
const report = await sandbox.destroy({
  eval: {
    mode: 'ai',
    taskDescription: 'Fix the failing auth test in src/auth/login.test.ts',
    model: 'claude-sonnet-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});

// report.aiEval.verdict: 'task-completed' | 'partial' | 'failed' | 'off-task'
// report.aiEval.reasoning: string
```

---

## 17. Known Limitations & Honest Caveats

These are not aspirational — they are real constraints that must be documented prominently in WABOX's README.

### 17.1 MXC Is in Public Preview

`@microsoft/mxc-sdk` is explicitly marked "schemas and APIs may change between minor versions until 1.0." WABOX pins a specific schema version and will track changes, but downstream users should expect that WABOX updates may be required when MXC's schema stabilises.

### 17.2 Windows 11 24H2+ Only (for processcontainer)

The stable `processcontainer` backend requires Windows 11 build 26100 (24H2). Earlier Windows versions are not supported. There is no fallback to an older backend in WABOX v1.

### 17.3 v1 Network Restriction Is Advisory

The proxy-based network layer can be bypassed by:
- Processes that implement their own TCP/IP socket calls
- Processes that ignore HTTP proxy environment variables
- Raw UDP traffic
- Processes that read proxy settings from the registry rather than environment variables

For any workload where network enforcement must be robust, use v2's `enforcement: 'firewall'` mode once available.

### 17.4 No Filesystem Snapshot in v1

In v1, `exec()` calls share no persistent state between them (each is a one-shot MXC spawn). Agents that need state between commands must manage it themselves (e.g. writing to the workspace). True stateful sessions require v2.

### 17.5 Risk Classification Is Heuristic

WABOX's risk scoring is pattern matching, not semantic understanding. It can produce false positives (flagging benign commands) and false negatives (missing genuinely risky commands that don't match known patterns). Do not rely on it as a security control; treat it as a debugging and auditing aid.

### 17.6 PowerShell Quirk Auto-Fixed, But Documented

WABOX automatically sets `ui.allowWindows: true` when it detects PowerShell in a command. Users should know this means the sandboxed PowerShell process can make win32k syscalls. This is a necessary tradeoff for PowerShell compatibility.

### 17.7 WABOX Is Not a Security Product

WABOX is a developer experience layer with security-adjacent features. It reduces the blast radius of a misbehaving agent. It is not a hardened security boundary and should not be the sole defence against malicious model output in a production system.

---

## 18. Open Questions

These are unresolved design questions that should be answered before or during v1 development.

1. **Log file format** — JSON per session, or a single append-only NDJSON log for all sessions? NDJSON is better for streaming/monitoring but harder to read manually.

2. **Proxy implementation** — Write a minimal Node.js HTTP proxy, or depend on an existing npm package? If a dependency, which one has the right licence and maintenance status?

3. **Risk rule storage** — Hard-coded in WABOX source, or loaded from a JSON file that users can extend? The latter is more flexible but harder to keep correct.

4. **Telemetry** — Should WABOX optionally report anonymous usage (which presets are used, what error codes hit) to help improve the project? Opt-in only. Needs a clear decision and privacy statement.

5. **MXC binary distribution** — MXC's npm package includes a native binary (`wxc-exec.exe`). WABOX users get it transitively. Need to verify this works correctly in `npx wabox setup` without manual steps.

6. **ESM vs CJS** — WABOX should ship as ESM (Node.js ≥ 18 is the requirement, ESM is the right choice). Confirm that MXC SDK is also ESM-compatible or that the interop is clean.

7. **Windows Home SKU** — MXC's `processcontainer` backend should work on Windows Home (unlike Windows Sandbox which doesn't ship on Home). This needs explicit testing and documentation.

---

*End of WABOX Product Specification v0.1*

---

**Document maintained by:** WABOX contributors  
**MXC SDK reference:** https://github.com/microsoft/mxc/blob/main/sdk/README.md  
**OpenAI Codex sandbox reference:** https://openai.com/index/building-codex-windows-sandbox/
