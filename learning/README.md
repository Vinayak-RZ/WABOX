# WABOX Learning Hub

Your personal study guide for this codebase. Add new notes here as you build and debug.

## Start here

| Doc | What you'll learn |
|-----|-------------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Layers, data flow, and why the project is split this way |
| [FILE_GUIDE.md](./FILE_GUIDE.md) | What every source file does (read alongside the code) |
| [CONCEPTS.md](./CONCEPTS.md) | MXC, DACL, PATH mirroring, timeouts — plain language |
| [EXEC_FLOW.md](./EXEC_FLOW.md) | Trace one `sandbox.exec()` from API to `wxc-exec.exe` |
| [JOURNAL.md](./JOURNAL.md) | Dated discoveries and “aha” moments from real work |

## How to use this folder

1. **Before changing code** — skim `FILE_GUIDE.md` for the area you're touching.
2. **When something breaks** — add a short entry to `JOURNAL.md` (date + symptom + cause + fix).
3. **When you learn a new concept** — add a bullet to `CONCEPTS.md` or link to an external doc.

## Suggested exercises

- Set `WABOX_DEBUG=1` and run `npm run diagnose` — map log lines to files in `EXEC_FLOW.md`.
- Put a breakpoint in `mxc-adapter.ts` `execInMxcSandbox` and step through one command.
- Change `node-dev` preset timeout in `presets/node-dev.ts` and observe benchmark behavior.
- Read MXC SDK README: https://github.com/microsoft/mxc/blob/main/sdk/README.md

## Related project docs

- [WABOX_SPEC.md](../WABOX_SPEC.md) — full product vision
- [docs/DECISIONS.md](../docs/DECISIONS.md) — architecture decision records
- [docs/MVP_LIMITATIONS.md](../docs/MVP_LIMITATIONS.md) — what MVP does *not* do yet
- [docs/BENCHMARK.md](../docs/BENCHMARK.md) — WABOX vs Docker benchmarking
