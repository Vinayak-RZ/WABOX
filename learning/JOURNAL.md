# Learning Journal

Dated notes from building and debugging WABOX. **Add new entries at the top.**

---

## 2026-06-26 — Benchmark appears to hang at `WABOX...`

**Symptom:** `npm run benchmark` prints `WABOX...` then nothing for minutes; eventually times out at 180s.

**What was actually happening:**
- Not stuck in TypeScript — waiting on `wxc-exec.exe` child process
- MXC `appcontainer-dacl` tier runs DACL recovery on every path in the policy
- PATH mirror included drive root `D:\` → enormous DACL work
- No progress logs existed between start and finish

**Fixes shipped:**
- `sanitize-paths.ts` — drop `C:`, `D:\`, etc. from mirror
- `WABOX_DEBUG=1` — phased logs + live stderr
- `npm run diagnose` — preflight script
- Benchmark iteration logging

**Files to study:** `mxc-adapter.ts`, `build-policy.ts`, `sanitize-paths.ts`

**Host action still recommended:** `wxc-host-prep prepare-system-drive` (elevated)

---

## 2026-06-25 — Pipe mode vs PTY for MXC

**Discovery:** `spawnSandboxAsync` (PTY) merges stderr into stdout with escape codes. `spawnSandboxFromConfig({ usePty: false })` gives clean separated streams.

**Decision:** WABOX always uses pipe mode in `mxc-adapter.ts`.

**Files:** `infrastructure/mxc-adapter.ts`

---

## 2026-06-25 — stdin must be closed

**Symptom:** `wxc-exec` child never emits `close`.

**Cause:** Pipe stdin left open; native process waiting for EOF.

**Fix:** `child.stdin?.end()` after spawn.

**Files:** `infrastructure/mxc-adapter.ts`, `scripts/mxc-spike.ts`

---

## 2026-06-25 — Auto-deny `.env` broke MXC

**Symptom:** Fast fail with DACL error on non-existent `workspace/.env`.

**Cause:** MXC DACL fallback requires write-DAC on denied paths even if file missing.

**Fix:** Removed auto `.env` deny from MVP `build-policy.ts`.

---

## Template for new entries

```markdown
## YYYY-MM-DD — Short title

**Symptom:** What you observed

**Cause:** Root cause in plain language

**Fix / learning:** What changed or what you now understand

**Files to study:** `path/to/file.ts`
```
