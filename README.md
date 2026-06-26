# WABOX

**Windows Agent Sandbox** — a TypeScript library that wraps [@microsoft/mxc-sdk](https://github.com/microsoft/mxc/blob/main/sdk/README.md) with an agent-friendly API for native Windows execution.

## Status

**MVP (0.1.0)** — `createAgentSandbox`, `node-dev` preset, `exec()`, session JSON logs. See [docs/MVP_LIMITATIONS.md](docs/MVP_LIMITATIONS.md) for deferred features.

Full product spec: [WABOX_SPEC.md](WABOX_SPEC.md)

**Learning:** [learning/](learning/README.md) — file guide, architecture, concepts, and journal

## Requirements

- **Windows 11 24H2+** (build 26100+) — MXC `processcontainer` backend
- **Node.js ≥ 18**
- Cursor engineering config in `.cursor/` (from [cursor-config-coding](https://github.com/Vinayak-RZ/cursor-config-coding))

## Install

```bash
npm install wabox @microsoft/mxc-sdk
```

From this repo (development):

```bash
npm install
npm run build
```

## Quick start

```ts
import { createAgentSandbox, getSupportStatus } from 'wabox';

const status = getSupportStatus();
if (!status.supported) {
  throw new Error(status.errors.join('\n'));
}

const sandbox = createAgentSandbox({
  preset: 'node-dev',
  policy: {
    filesystem: { workspacePath: 'C:/path/to/your/project' },
  },
});

const result = await sandbox.exec('node -e "console.log(1+1)"');
console.log(result.stdout); // "2\n"

const log = await sandbox.destroy();
// Session JSON written to .wabox/sessions/<sessionId>.json
```

Run the included example:

```bash
npm run example
```

## API (MVP)

| Export | Description |
|--------|-------------|
| `createAgentSandbox(options)` | Start a sandbox session |
| `sandbox.exec(command, options?)` | Run one command (one-shot MXC spawn) |
| `sandbox.getActionLog()` | In-memory action list |
| `sandbox.destroy()` | Persist session log, end session |
| `getSupportStatus()` | Preflight platform/MXC check |
| `listPresets()` | `['node-dev']` in MVP |

## Development

Copy [`.env.example`](.env.example) to `.env` for local defaults (`WABOX_MIRROR_ENV=minimal`, workspace path, timeouts, debug).

```bash
cp .env.example .env   # or copy on Windows
npm run build          # compile to dist/
npm test               # unit tests (CI-safe)
npm run test:integration   # Windows sandbox spawn (set WABOX_INTEGRATION=1)
npm run diagnose       # MXC preflight (reads .env)
npm run example        # smoke test via createAgentSandbox
npm run spike          # raw MXC Phase 0 smoke test
```

## Architecture

```
Agent code → createAgentSandbox → Policy builder → MXC SDK → Windows processcontainer
                      ↓
              Action log + session JSON
```

Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

## License

MIT
