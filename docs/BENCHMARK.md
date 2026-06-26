# WABOX vs Docker — Performance Benchmark Guide

This guide explains how to test WABOX and compare it fairly against Docker for **agent-style workloads on Windows**.

## Why compare?

WABOX’s thesis (see [WABOX_SPEC.md](../WABOX_SPEC.md)) is that **native Windows process sandboxing** via MXC is a better fit than forcing agents through **Docker + Linux/WSL2** when developers want:

- Real host tools at real paths (Node, npm, Git)
- Direct read/write to the project directory (no copy/sync)
- Lower per-command overhead (no Linux VM hop)

Docker is still the default “sandbox” for many agent tools on Windows — this benchmark quantifies the gap.

---

## Reference results (this machine)

Two runs on the same host (Windows 11 24H2, 16 cores, Node 24.14.0, Docker 29.2.0, `node:22-alpine`, 3 iterations, one-shot model).

### Host

| | |
|---|---|
| OS | Windows_NT 10.0.26200 (x64) |
| Node | 24.14.0 |
| CPUs / RAM | 16 cores · 15.8 GB |
| MXC tier | `appcontainer-dacl` |
| Workspace | `D:/Tech/WABOX` |

---

### Run 2 — minimal mirror + host prep (current)

**Source:** `.wabox/benchmarks/wabox-vs-docker-2026-06-26T09-30-16-285Z.json`  
**Config:** `.env` with `WABOX_MIRROR_ENV=minimal`, elevated `wxc-host-prep prepare-system-drive`, policy **1 readonly + 2 readwrite** paths per spawn

| Workload | WABOX mean | WABOX p50 | WABOX cold | WABOX ok | Docker mean | Docker p50 | Docker cold | Docker ok | Faster (mean) |
|----------|------------|-----------|------------|----------|-------------|------------|-------------|-----------|---------------|
| **echo** | **1.4 s** | 1.4 s | 1.4 s | 3/3 | 1.9 s | 1.2 s | 3.5 s | 3/3 | **WABOX ~1.4×** |
| **node-eval** | — | — | 1.3 s | 0/3 | 1.3 s | 1.1 s | 1.9 s | 3/3 | **Docker** (WABOX failed) |
| **npm-version** | — | — | 1.3 s | 0/3 | 1.2 s | 1.2 s | 1.1 s | 3/3 | **Docker** (WABOX failed) |

#### Per-iteration detail

**echo — WABOX wins on mean latency**

| Iteration | WABOX | Docker |
|-----------|-------|--------|
| 1 (cold) | 1,416 ms · ok | 3,540 ms · ok |
| 2 | 1,281 ms · ok | 1,048 ms · ok |
| 3 | 1,507 ms · ok | 1,217 ms · ok |

**node-eval — fast fail (`0xC0000142`)**

| Iteration | WABOX | Docker |
|-----------|-------|--------|
| 1–3 | ~1.2–1.3 s · exit `0xC0000142` | ~1.0–1.9 s · ok |

**npm-version — `npm` not found (`.cmd` shim)**

| Iteration | WABOX | Docker |
|-----------|-------|--------|
| 1–3 | ~1.2–1.3 s · CreateProcessW file not found | ~1.1–1.2 s · ok |

#### Preflight notes (same session)

| Step | Result |
|------|--------|
| `npm run diagnose` | Pass — but **first** `cmd` spawn took **~274 s** (DACL recovery on `D:\` workspace path) |
| `npm run example` | `node -e` failed in **~1.5 s** with `0xC0000142` |
| Warm echo spawns (after diagnose) | **~1.3–1.5 s** — DACL cache warm |

#### What Run 2 shows

| Claim | Supported? |
|-------|------------|
| WABOX can beat Docker on simple native commands | **Yes** — `echo` mean **1.4 s** vs Docker **1.9 s** |
| Minimal PATH mirror fixes DACL slowness | **Yes** — echo dropped from **~30 s** → **~1.4 s** |
| WABOX is ready for node/npm agent loops | **No** — node init failure + npm shim |
| First spawn on `D:\` workspace is still expensive | **Yes** — diagnose cold spawn **~4.5 min** once per session |
| Host prep (`prepare-system-drive`) matters | **Yes** — required for `cmd`; node still broken for other reasons |

**Honest takeaway:** With `mirrorEnv: 'minimal'` and host prep, WABOX is **faster than Docker for `cmd /c echo`** on this host. The product thesis is **partially validated** for shell one-shots only. **Node and npm are still broken** — not a fair speed comparison yet.

---

### Run 1 — full PATH mirror, no host prep (baseline)

**Source:** `.wabox/benchmarks/wabox-vs-docker-2026-06-26T08-04-42-481Z.json`  
**Config:** default full PATH mirror (**41** readonly paths), no `wxc-host-prep`

| Workload | WABOX mean | WABOX p50 | WABOX cold | WABOX ok | Docker mean | Docker p50 | Docker cold | Docker ok | Faster (mean) |
|----------|------------|-----------|------------|----------|-------------|------------|-------------|-----------|---------------|
| **echo** | 32.7 s | 28.2 s | 42.0 s | 3/3 | 2.5 s | 1.5 s | 4.9 s | 3/3 | **Docker ~13×** |
| **node-eval** | — | — | 43.3 s | 0/3 | 2.1 s | 2.0 s | 3.4 s | 3/3 | **Docker** |
| **npm-version** | — | — | 81.7 s | 0/3 | 2.4 s | 1.5 s | 4.4 s | 3/3 | **Docker** |

Use Run 1 as the “unconfigured host” baseline. Run 2 shows what changes when `.env` + host prep + minimal mirror are applied.

---

### Run 1 vs Run 2 (echo only)

| Metric | Run 1 (full mirror) | Run 2 (minimal + prep) | Change |
|--------|---------------------|-------------------------|--------|
| Readonly paths | 41 | 1 | −97% |
| echo mean | 32.7 s | 1.4 s | **~23× faster** |
| echo ok | 3/3 | 3/3 | — |
| vs Docker mean | Docker ~13× faster | **WABOX ~1.4× faster** | Flipped |

---

## What we measure

| Metric | Meaning |
|--------|---------|
| **Cold start** | First iteration latency |
| **Mean / p50 / p95** | Per-command latency over N iterations (successful runs only in stats) |
| **Success rate** | % of iterations that exited 0 |

### Workloads (default)

1. `cmd /c echo` vs `docker run … echo`
2. `node -e` vs `docker run … node -e`
3. `npm --version` vs `docker run … npm --version`

## Fair comparison model

Both sides use **one-shot execution** — the pattern WABOX MVP uses today:

| | WABOX | Docker |
|---|--------|--------|
| Model | New MXC spawn per `exec()` | New `docker run --rm` per iteration |
| Filesystem | Native `workspacePath` | Bind mount `repo:/work` |
| Node | Host Node (mirrored) | `node:22-alpine` image |

**Not compared (yet):** long-lived containers with `docker exec` — that maps to WABOX v2 `isolation_session` / stateful mode.

**Important:** Docker on Windows runs **Linux containers** through WSL2/Hyper-V. WABOX runs **native Windows processes**. The benchmark measures end-to-end agent latency on Windows, not identical OS environments.

## Run the benchmark

Copy [`.env.example`](../.env.example) to `.env` (recommended: `WABOX_MIRROR_ENV=minimal`).

```bash
npm run build
npm run benchmark

# More iterations, custom image
npm run benchmark -- --iterations 5 --docker-image node:22-alpine

# WABOX only (Docker Desktop not required)
npm run benchmark -- --wabox-only --iterations 3
```

Results are written to `.wabox/benchmarks/wabox-vs-docker-<timestamp>.json`.

### Prerequisites

1. Copy `.env.example` → `.env` (`WABOX_MIRROR_ENV=minimal`, `WABOX_WORKSPACE_PATH`, `WABOX_EXEC_TIMEOUT_MS=300000`)
2. Elevated: `wxc-host-prep prepare-system-drive` (and `prepare-null-device` if needed)
3. `npm run diagnose` passes (first run may take minutes on `D:\` workspace — wait it out once)
4. Docker Desktop running (for full comparison)

### Debugging hangs

```powershell
$env:WABOX_DEBUG = "1"
npm run diagnose
```

**What is happening:** MXC `appcontainer-dacl` runs DACL recovery on every policy path. Full PATH mirror = dozens of paths (~30 s+ per spawn). Minimal mirror = few paths (~1–2 s warm). Workspace on `D:\` can still trigger a **one-time** `D:\` DACL recovery (~4+ min) on first spawn in a session.

See [MVP_LIMITATIONS.md](MVP_LIMITATIONS.md).

## Interpreting results

In the JSON report, `comparison.meanSpeedup` = Docker mean ÷ WABOX mean.

| meanSpeedup | Meaning |
|-------------|---------|
| **> 1** | WABOX faster (lower latency) |
| **< 1** | Docker faster |
| **null** | WABOX had no successful runs — cannot compare |

### What this does *not* prove

- Security superiority (different threat models)
- Network isolation strength (WABOX MVP is MXC block/allow only)
- macOS/Linux performance

## Honest positioning

**Only claim what your JSON shows.**

Validated on this host (Run 2):

> “With `WABOX_MIRROR_ENV=minimal` and MXC host prep, WABOX one-shot `cmd /c echo` averaged **1.4 s** vs Docker `docker run` **1.9 s** (~1.4× faster on mean).”

**Do not claim** WABOX beats Docker for node/npm until those workloads pass benchmark at 100% success rate.

## Known gaps (blocking full comparison)

| Issue | Symptom | Likely fix |
|-------|---------|------------|
| **Minimal mirror too narrow for `node.exe`** | `0xC0000142` in ~1.3 s | Add required readonly paths (Node install dir, `System32`, MSVC runtime dirs) — not just one deduped PATH folder |
| **`npm` is a `.cmd` shim** | CreateProcessW file not found | Resolve to `npm.cmd` or run `cmd /c npm --version` in benchmark + exec layer |
| **`D:\` workspace cold DACL** | First spawn ~274 s | Document; consider `wxc-host-prep` for data drive or move workspace to `C:\` for dev |
| **Diagnose only tests `cmd`** | Green diagnose, red node | Extend diagnose to run `node -e` and `npm --version` |

## Next work (priority)

1. [ ] **Expand minimal mirror** — include `process.execPath` dir + Windows system dirs node needs at startup
2. [ ] **Windows shim handling** — resolve `npm`/`npx` to `.cmd` or shell-wrap in `exec()`
3. [ ] **Diagnose gate** — fail diagnose unless node + npm succeed
4. [ ] **Re-benchmark** after fixes — target: node/npm 3/3 ok, then compare mean/p50 vs Docker
5. [ ] Memory / CPU sample via `Get-Process` vs `docker stats`
6. [ ] Stateful session: `docker exec` vs WABOX v2 `isolation_session`
7. [ ] `npm install` in workspace (realistic agent task)
