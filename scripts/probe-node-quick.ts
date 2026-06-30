/** Quick single-case node probe: tsx scripts/probe-node-quick.ts [baseline|expand|cmd|both] */
import './bootstrap-env.js';
import { buildPolicy } from '../src/policy/build-policy.js';
import { execInMxcSandbox } from '../src/infrastructure/mxc-adapter.js';
import { mergeAgentSandboxOptions, readWaboxEnv } from '../src/infrastructure/wabox-env.js';
import { prepareWindowsCommandLine } from '../src/policy/windows-command.js';

const mode = process.argv[2] ?? 'cmd';
const expand = mode === 'expand' || mode === 'both';
const viaCmd = mode === 'cmd' || mode === 'both';

process.env.WABOX_EXPAND_NODE_MIRROR = expand ? '1' : '0';
process.env.WABOX_NODE_VIA_CMD = viaCmd ? '1' : '0';

const waboxEnv = readWaboxEnv();
const merged = mergeAgentSandboxOptions({
  preset: 'node-dev',
  policy: { filesystem: { workspacePath: waboxEnv.workspacePath ?? process.cwd() } },
});
const { policy } = buildPolicy({
  preset: 'node-dev',
  mirrorEnv: merged.mirrorEnv,
  overrides: merged.policy,
});

const nodeCmd = 'node -e "console.log(42)"';
const npmCmd = 'npm --version';
const timeoutMs = waboxEnv.execTimeoutMs ?? 120_000;

console.log(`mode=${mode} readonly=${policy.filesystem?.readonlyPaths?.length}`);
console.log('node prepared:', prepareWindowsCommandLine(nodeCmd));
console.log('npm prepared:', prepareWindowsCommandLine(npmCmd));

for (const [label, cmd] of [
  ['node', nodeCmd],
  ['npm', npmCmd],
] as const) {
  const started = Date.now();
  const r = await execInMxcSandbox(policy, cmd, { timeoutMs });
  const hex = r.exitCode !== 0 ? ` (0x${(r.exitCode >>> 0).toString(16).toUpperCase()})` : '';
  console.log(
    `${label}: exit=${r.exitCode}${hex} ${Date.now() - started}ms stdout=${JSON.stringify(r.stdout.trim())} stderr=${JSON.stringify(r.stderr.trim().slice(-200))}`,
  );
}
