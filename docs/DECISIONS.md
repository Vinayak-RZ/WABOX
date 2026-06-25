# WABOX — Architecture Decisions

## ADR-001: MXC schema version

**Decision:** Pin `@microsoft/mxc-sdk` policy schema to `0.7.0-alpha`.

**Context:** WABOX_SPEC v0.1 referenced `0.6.0-alpha`. MXC SDK README (2026) recommends `0.7.0-alpha` for new code.

**Consequence:** Update product spec header to `0.7.0-alpha`. Adapter isolates version in `src/infrastructure/mxc-constants.ts`.

---

## ADR-002: ESM-only package

**Decision:** Ship `wabox` as `"type": "module"` with NodeNext resolution.

**Context:** Node ≥ 18 requirement; MXC SDK exports ESM-compatible named exports.

**Consequence:** Examples and tests use `tsx` or compiled `dist/` output.

---

## ADR-003: One-shot exec per `exec()` call (MVP)

**Decision:** Each `sandbox.exec()` spawns a fresh MXC sandbox via `spawnSandboxFromConfig({ usePty: false })`.

**Context:** `processcontainer` backend does not preserve shell state between spawns. Stateful sessions require `isolation_session` (v2).

**Consequence:** Document clearly in MVP limitations. Agents must persist state via workspace files.

---

## ADR-004: Session logs as JSON files

**Decision:** One `{sessionId}.json` per session, written atomically on `destroy()`.

**Context:** Spec open question #1 — JSON vs NDJSON.

**Consequence:** Simple manual debugging; streaming/aggregation deferred.

---

## Phase 0 spike notes

- **Host:** Windows with MXC `getPlatformSupport().isSupported === true`
- **Backend:** `processcontainer` (may fall back to `appcontainer-dacl` tier per MXC probe)
- **Binary:** `wxc-exec.exe` resolves transitively via `@microsoft/mxc-sdk` npm package (no manual `MXC_BIN_DIR` required in normal install)
- **Isolation warnings:** If AppContainer+DACL tier is selected, MXC may recommend elevated `wxc-host-prep prepare-system-drive` for system-drive metadata access. Integration tests may hang without this on some hosts — run `npm run test:integration` after host prep.
