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

**Source:** `.wabox/benchmarks/wabox-vs-docker-2026-06-26T08-04-42-481Z.json`  
**Run:** 2026-06-26 · 3 iterations per workload · `node:22-alpine` · one-shot model

### Host

| | |
|---|---|
| OS | Windows_NT 10.0.26200 (x64) |
| Node | 24.14.0 |
| CPUs / RAM | 16 cores · 15.8 GB |
| MXC tier | `appcontainer-dacl` |
| Docker | 29.2.0 |

MXC warnings on this host: BaseContainer unavailable; recommends elevated `wxc-host-prep prepare-system-drive`.

### Summary table

| Workload | WABOX mean | WABOX p50 | WABOX cold | WABOX ok | Docker mean | Docker p50 | Docker cold | Docker ok | Faster (mean) |
|----------|------------|-----------|------------|----------|-------------|------------|-------------|-----------|---------------|
| **echo** (`cmd /c echo`) | 32.7 s | 28.2 s | 42.0 s | 3/3 | 2.5 s | 1.5 s | 4.9 s | 3/3 | **Docker ~13×** |
| **node-eval** (`node -e`) | — | — | 43.3 s | 0/3 | 2.1 s | 2.0 s | 3.4 s | 3/3 | **Docker** (WABOX failed) |
| **npm-version** (`npm --version`) | — | — | 81.7 s | 0/3 | 2.4 s | 1.5 s | 4.4 s | 3/3 | **Docker** (WABOX failed) |

*WABOX mean/p50 omitted where success rate was 0%.*

### Per-iteration detail

#### echo — only workload where WABOX succeeded

| Iteration | WABOX | Docker |
|-----------|-------|--------|
| 1 (cold) | 41,968 ms | 4,855 ms |
| 2 | 28,160 ms | 1,501 ms |
| 3 | 28,036 ms | 1,239 ms |

WABOX warmed from ~42 s → ~28 s after first DACL-heavy spawn. Docker warmed from ~5 s → ~1.2 s.

#### node-eval — WABOX failed every iteration

| Iteration | WABOX | Docker |
|-----------|-------|--------|
| 1 | 43,260 ms · exit `0xC0000142` | 3,364 ms · ok |
| 2 | 31,814 ms · exit `0xC0000142` | 1,981 ms · ok |
| 3 | 35,206 ms · exit `0xC0000142` | 1,100 ms · ok |

`0xC0000142` = Windows “application failed to initialize” — sandboxed `node.exe` could not start under AppContainer+DACL on this host without full host prep.

#### npm-version — WABOX failed every iteration

| Iteration | WABOX | Docker |
|-----------|-------|--------|
| 1 | 81,746 ms · CreateProcessW file not found | 4,416 ms · ok |
| 2 | 65,578 ms · file not found | 1,469 ms · ok |
| 3 | 56,214 ms · file not found | 1,382 ms · ok |

MXC could not resolve `npm` inside the sandbox (PATH/metadata issue on `appcontainer-dacl` tier), even after ~60–80 s per attempt.

### What this run actually shows

| Claim | Supported by this run? |
|-------|------------------------|
| WABOX is faster than Docker today | **No** — Docker won on all comparable workloads |
| WABOX can run simple Windows commands | **Partially** — `cmd /c echo` works but ~13× slower than `docker run` |
| WABOX can run Node/npm agent tasks on this host | **No** — node init failure + npm not found |
| Docker one-shot overhead is low | **Yes** — ~1.2–2.5 s warm, ~3–5 s cold |
| MXC host prep matters | **Yes** — `appcontainer-dacl` + missing prep explains failures and slow echo |

**Honest takeaway:** On this machine **without** `wxc-host-prep`, Docker is faster and more reliable for the default benchmark workloads. WABOX’s performance story is **not validated yet** — rerun after host prep and when `npm run diagnose` passes node + npm.

**Target narrative (after host is healthy):** Re-benchmark and look for WABOX warm p50 &lt; Docker warm p50 on `node -e` and `npm --version`. Until then, use the echo row only as a “MXC works but DACL is expensive” data point.

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

- Windows 11 24H2+ with MXC working (`npm run spike` or `npm run diagnose` passes **all** steps including node/npm)
- Docker Desktop running (for full comparison)
- **Recommended before benchmarking:** elevated `wxc-host-prep prepare-system-drive`

### Debugging hangs

If the benchmark stops at `WABOX...` with no output for minutes:

```powershell
$env:WABOX_DEBUG = "1"
npm run diagnose
```

**What is happening:** WABOX spawns `wxc-exec.exe` (MXC native binary). On the `appcontainer-dacl` tier, wxc-exec may run **DACL recovery** across every path in the sandbox policy before your command runs. WABOX drops drive-root PATH entries automatically; host prep is still required for reliable `node`/`npm` startup.

See [MVP_LIMITATIONS.md](MVP_LIMITATIONS.md).

## Interpreting results

In the JSON report, `comparison.meanSpeedup` = Docker mean ÷ WABOX mean.

| meanSpeedup | Meaning |
|-------------|---------|
| **> 1** | WABOX faster (lower latency) |
| **< 1** | Docker faster |
| **null** | WABOX had no successful runs — cannot compare |

### Reading the reference run

- **echo:** meanSpeedup ≈ **0.08** → Docker ~13× faster on mean latency
- **node-eval / npm-version:** meanSpeedup **null** → fix WABOX reliability first, then re-benchmark

### Expected patterns (healthy host)

| Scenario | Typical winner |
|----------|----------------|
| Simple echo (warm, host prepped) | Closer race; WABOX may improve after DACL cache warms |
| node / npm one-liner (warm) | WABOX *may* beat Docker if MXC spawn &lt; container boot — **needs re-measurement** |
| First command after reboot | Often slow for WABOX (DACL cold start) |
| Linux-only tooling | Docker — different problem domain |

### What this does *not* prove

- Security superiority (different threat models)
- Network isolation strength (WABOX MVP is MXC block/allow only)
- macOS/Linux performance

## Honest positioning

**Only claim what your JSON shows.** Example after a successful run:

> “On Windows 11 24H2 with MXC host prep, WABOX one-shot `node -e` averaged X ms vs Docker `docker run` Y ms (Z× faster).”

**Do not claim** WABOX replaces Docker for all sandboxing — only for **Windows-native agent dev workflows** when MXC is healthy on the host.

## Next benchmarks (backlog)

- [ ] Re-run after `wxc-host-prep` and add second results table
- [ ] Memory / CPU sample via `Get-Process` vs `docker stats`
- [ ] Stateful session: `docker exec` vs WABOX v2 `isolation_session`
- [ ] `npm install` in workspace (I/O heavy, realistic agent task)
- [ ] CI script that fails soft when MXC unsupported
