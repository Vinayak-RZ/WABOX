# WABOX vs Docker — Performance Benchmark Guide

This guide explains how to test WABOX and compare it fairly against Docker for **agent-style workloads on Windows**.

## Why compare?

WABOX’s thesis (see [WABOX_SPEC.md](../WABOX_SPEC.md)) is that **native Windows process sandboxing** via MXC is a better fit than forcing agents through **Docker + Linux/WSL2** when developers want:

- Real host tools at real paths (Node, npm, Git)
- Direct read/write to the project directory (no copy/sync)
- Lower per-command overhead (no Linux VM hop)

Docker is still the default “sandbox” for many agent tools on Windows — this benchmark quantifies the gap.

## What we measure

| Metric | Meaning |
|--------|---------|
| **Cold start** | First successful iteration latency |
| **Mean / p50 / p95** | Per-command latency over N iterations |
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

- Windows 11 24H2+ with MXC working (`npm run spike` passes)
- Docker Desktop running
- Optional: `wxc-host-prep prepare-system-drive` (elevated) if MXC cold start is very slow

## Interpreting results

**Speedup > 1** in the JSON `comparison.meanSpeedup` means WABOX mean latency is lower (Docker mean / WABOX mean).

### Expected patterns

| Scenario | Typical winner |
|----------|----------------|
| Simple echo / node one-liner (warm) | WABOX often faster — no container boot |
| First command after reboot | Depends — MXC DACL cold start can be slow |
| npm with cold Docker image | Docker may lose on first pull; exclude pull time |
| Heavy Linux-only tooling | Docker — different problem domain |

### What this does *not* prove

- Security superiority (different threat models)
- Network isolation strength (WABOX MVP is MXC block/allow only)
- macOS/Linux performance

## Honest positioning

Use results to support:

> “For native Windows agent loops that spawn per command, WABOX reduces latency vs `docker run` by X× on mean/p50 for node/npm tasks.”

Do **not** claim WABOX replaces Docker for all sandboxing — only for **Windows-native agent dev workflows** where Docker adds a Linux VM tax.

## Next benchmarks (backlog)

- [ ] Memory / CPU sample via `Get-Process` vs `docker stats`
- [ ] Stateful session: `docker exec` vs WABOX v2 `isolation_session`
- [ ] `npm install` in workspace (I/O heavy, realistic agent task)
- [ ] CI script that fails soft when MXC unsupported
