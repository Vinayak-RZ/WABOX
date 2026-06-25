# WABOX MVP — Known Limitations

This document describes what the **0.1.0 MVP** does *not* do. WABOX is a blast-radius reducer for AI agents, not a hardened security boundary.

## Execution model

- **No state between `exec()` calls.** Each command is a fresh MXC one-shot spawn. Environment variables, shell `cd`, and installed packages from a prior `exec()` are not preserved unless written to the workspace.
- **Windows-first.** MVP targets Windows 11 24H2+ with MXC `processcontainer`. Other platforms are not supported in this release.

## Network

- **Block or allow only.** MVP uses MXC `network.allowOutbound` (default: block via `node-dev` preset).
- **No domain allowlist/blocklist.** Fine-grained HTTP filtering requires the advisory proxy layer (post-MVP v1.4) or Windows Firewall mode (v2).
- **Not OS-enforced HTTP filtering** in MVP — do not rely on WABOX MVP alone to prevent exfiltration.

## Security-adjacent features deferred

| Feature | Status |
|---------|--------|
| Risk classification / approval gate | Deferred |
| Eval reports / anomaly detection | Deferred |
| Credential `inject` (read-only secrets) | Deferred |
| Dev server `ports` / `dev-server:ready` | Deferred |
| `npx wabox setup` / `doctor` CLI | Deferred |
| Additional presets (`python-dev`, `read-only`, …) | Deferred (v1.1) |

## MXC preview dependency

`@microsoft/mxc-sdk` is public preview. WABOX pins a specific SDK version; upgrades may be required when MXC stabilizes.

## Host preparation

On some Windows hosts MXC selects the **AppContainer + DACL** isolation tier. If sandbox spawns hang or fail to start `node.exe`:

1. Check `getSupportStatus().isolationWarnings`
2. Run elevated MXC host prep: `wxc-host-prep prepare-system-drive` (ships with MXC native binaries)
3. Avoid denying non-existent paths (e.g. `workspace/.env`) — MXC DACL fallback may require write-DAC on denied paths
4. **Cold start can be slow** — first spawn on `appcontainer-dacl` may take several minutes while MXC applies DACL recovery; subsequent spawns are typically faster

Integration tests (`WABOX_INTEGRATION=1`) require a host where MXC one-shot spawns complete successfully.

## Threat model

WABOX MVP is designed for **accidental damage reduction** (wrong deletes, rogue installs), not defense against malicious model output or kernel-level attacks.
