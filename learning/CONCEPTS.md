# Core Concepts

Plain-language definitions for terms you'll see in code, logs, and MXC stderr.

---

## MXC (Microsoft eXecution Containers)

**What:** Microsoft's SDK + native binary (`wxc-exec.exe`) for running a process with a **policy** (which files and network it can use).

**Analogy:** A bouncer with a checklist — not a separate VM like Docker. The process still runs on Windows, but with restricted permissions.

**WABOX's job:** Hide MXC complexity (policy building, PowerShell quirks, logging) behind `createAgentSandbox`.

**Docs:** https://github.com/microsoft/mxc/blob/main/sdk/README.md

---

## processcontainer

**What:** MXC's default Windows backend — process-level isolation (not a full VM).

**Requirement:** Windows 11 24H2+ (build 26100).

---

## AppContainer + DACL (isolation tier)

**What:** A fallback when full BaseContainer isn't available. MXC adjusts **DACLs** (Windows file permission ACLs) on each path in your policy before running the command.

**Symptom:** Long silence after spawn, stderr mentions `DACL recovery` or `appcontainer-dacl`.

**Mitigation:**
- Run elevated `wxc-host-prep prepare-system-drive`
- Keep policy paths small (WABOX drops drive roots like `D:\`)
- First spawn can be slow; later spawns often faster

---

## PATH mirroring (`mirrorEnv`)

**What:** WABOX copies host tool locations into the sandbox as **readonly** paths so `node`, `npm`, `git` work at their real locations.

**Modes:**

| `mirrorEnv` | DACL scope | Use when |
|-------------|------------|----------|
| `true` (default) | Every PATH dir MXC discovers (~40+ paths) | Maximum tool compatibility |
| `'minimal'` | Only dirs containing `node` / `npm` / `npx` / `git` (~2–4 paths) | Faster spawns on `appcontainer-dacl` |
| `false` | No PATH mirror — workspace + temp only | Read-only workspace experiments; **host `node` won't run** |

**Workspace alone is not enough** for the `node-dev` preset: `node.exe` lives outside `D:\Tech\WABOX`. MXC DACL-walks every path listed in the policy — not your whole drive — but full PATH mirror lists dozens of folders.

```ts
createAgentSandbox({
  mirrorEnv: 'minimal',
  policy: { filesystem: { workspacePath: 'D:/Tech/WABOX' } },
});
```

**How (full mode):** MXC `getAvailableToolsPolicy(process.env)` enumerates PATH entries.

**Risk:** If PATH contains `D:\`, MXC tries to DACL the entire drive — very slow.

**Fix in WABOX:** `sanitize-paths.ts` filters drive roots.

---

## One-shot exec model (MVP)

**What:** Every `sandbox.exec()` starts a **new** `wxc-exec` process. No shared shell between commands.

**Implication:** `cd`, `export`, and in-memory state don't persist across `exec()` calls.

**Docker comparison:** Similar to `docker run --rm` each time, not `docker exec` into a running container.

---

## Policy vs config

| Term | Layer | Example |
|------|-------|---------|
| `WaboxPolicy` | WABOX domain | `workspacePath`, preset overrides |
| `SandboxPolicy` | MXC SDK | `readonlyPaths`, `allowOutbound` |
| `ContainerConfig` | MXC spawn | adds `commandLine`, `cwd`, env |

`build-policy.ts` → WaboxPolicy  
`to-mxc-policy.ts` → SandboxPolicy  
`createConfigFromPolicy()` → ContainerConfig (in MXC SDK)

---

## `usePty: false`

**What:** MXC can spawn with a pseudo-terminal (merged stdout/stderr) or pipe mode (separate streams).

**WABOX choice:** Always pipe mode — agents need clean `stdout` / `stderr` and reliable exit codes.

---

## Session vs Action

| Term | Meaning |
|------|---------|
| **Session** | One `createAgentSandbox()` until `destroy()` |
| **Action** | One `exec()` inside a session |

Session log JSON contains all actions for that session.

---

## WABOX vs Docker on Windows

| | WABOX | Docker (typical) |
|---|--------|------------------|
| OS | Native Windows process | Linux container via WSL2/Hyper-V |
| Files | Real host paths | Volume mount `/work` |
| Node | Host install | Image `node:alpine` |
| Per-command cost | wxc-exec spawn + DACL | container start + namespace |

WABOX wins on **native toolchain + path fidelity**; Docker wins when you need **Linux-only** tooling.

---

## Debug environment variable

```powershell
$env:WABOX_DEBUG = "1"
```

Enables `[wabox:exec …]` logs and live stderr from `wxc-exec` in `mxc-adapter.ts`.
