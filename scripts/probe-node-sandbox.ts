/**
 * Probe node sandbox fixes one-by-one (requires boot warmup for fast iteration).
 *
 *   npm run warmup          # once per reboot if needed
 *   npm run probe:node      # tries baseline → expand mirror → cmd wrap → both
 */
import './bootstrap-env.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPolicy } from '../src/policy/build-policy.js';
import { execInMxcSandbox } from '../src/infrastructure/mxc-adapter.js';
import { mergeAgentSandboxOptions, readWaboxEnv } from '../src/infrastructure/wabox-env.js';
import { prepareWindowsCommandLine } from '../src/policy/windows-command.js';
import { resolveNodeInitReadonlyPaths } from '../src/policy/node-init-paths.js';
import { isBootWarmedForPolicy } from '../src/infrastructure/warmup-state.js';

const NODE_CMD = 'node -e "console.log(42)"';
const NPM_CMD = 'npm --version';

interface ProbeCase {
  name: string;
  expandMirror: boolean;
  nodeViaCmd: boolean;
}

const CASES: ProbeCase[] = [
  { name: '1-baseline', expandMirror: false, nodeViaCmd: false },
  { name: '2-expand-mirror', expandMirror: true, nodeViaCmd: false },
  { name: '3-node-via-cmd', expandMirror: false, nodeViaCmd: true },
  { name: '4-both', expandMirror: true, nodeViaCmd: true },
];

function exitLabel(code: number): string {
  if (code === 0) return 'OK';
  const hex = `0x${(code >>> 0).toString(16).toUpperCase()}`;
  if (hex === '0xC0000142') return `${hex} (STATUS_DLL_INIT_FAILED)`;
  return `${code} (${hex})`;
}

async function runCase(
  probe: ProbeCase,
  baseMerged: ReturnType<typeof mergeAgentSandboxOptions>,
  timeoutMs: number,
): Promise<{ node: string; npm: string; preparedNode: string; readonlyCount: number }> {
  const prevExpand = process.env.WABOX_EXPAND_NODE_MIRROR;
  const prevCmd = process.env.WABOX_NODE_VIA_CMD;
  process.env.WABOX_EXPAND_NODE_MIRROR = probe.expandMirror ? '1' : '0';
  process.env.WABOX_NODE_VIA_CMD = probe.nodeViaCmd ? '1' : '0';

  const { policy } = buildPolicy({
    preset: 'node-dev',
    mirrorEnv: baseMerged.mirrorEnv,
    overrides: baseMerged.policy,
  });

  const preparedNode = prepareWindowsCommandLine(NODE_CMD);
  const readonlyCount = policy.filesystem?.readonlyPaths?.length ?? 0;

  let nodeResult = 'skipped';
  let npmResult = 'skipped';

  try {
    const nodeExec = await execInMxcSandbox(policy, NODE_CMD, { timeoutMs });
    nodeResult =
      nodeExec.exitCode === 0 && nodeExec.stdout.includes('42')
        ? `PASS ${nodeExec.durationMs}ms`
        : `FAIL ${exitLabel(nodeExec.exitCode)} ${nodeExec.durationMs}ms stdout=${JSON.stringify(nodeExec.stdout.trim())}`;
  } catch (e) {
    nodeResult = `ERROR ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const npmExec = await execInMxcSandbox(policy, NPM_CMD, { timeoutMs });
    npmResult =
      npmExec.exitCode === 0 && npmExec.stdout.trim()
        ? `PASS ${npmExec.durationMs}ms (${npmExec.stdout.trim()})`
        : `FAIL ${exitLabel(npmExec.exitCode)} ${npmExec.durationMs}ms`;
  } catch (e) {
    npmResult = `ERROR ${e instanceof Error ? e.message : String(e)}`;
  }

  if (prevExpand === undefined) delete process.env.WABOX_EXPAND_NODE_MIRROR;
  else process.env.WABOX_EXPAND_NODE_MIRROR = prevExpand;
  if (prevCmd === undefined) delete process.env.WABOX_NODE_VIA_CMD;
  else process.env.WABOX_NODE_VIA_CMD = prevCmd;

  return { node: nodeResult, npm: npmResult, preparedNode, readonlyCount };
}

async function main(): Promise<void> {
  console.log('=== WABOX Node Sandbox Probe ===\n');

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

  if (!isBootWarmedForPolicy(policy)) {
    console.warn('⚠ Not warmed for current policy — run "npm run warmup" first or probes may take 5–10 min each.\n');
  }

  const timeoutMs = waboxEnv.execTimeoutMs ?? 120_000;

  // Approach 3 — native path inventory (no sandbox)
  console.log('── Approach 3: Native Node path inventory (no sandbox) ──');
  console.log(`   node execPath: ${process.execPath}`);
  console.log(`   USERPROFILE: ${process.env.USERPROFILE ?? '(unset)'}`);
  console.log(`   APPDATA: ${process.env.APPDATA ?? '(unset)'}`);
  const initPaths = resolveNodeInitReadonlyPaths(process.env);
  console.log(`   expand-mirror would add ${initPaths.length} extra readonly paths:`);
  for (const p of initPaths) console.log(`     - ${p}`);
  console.log('');

  const { policy } = buildPolicy({
    preset: 'node-dev',
    mirrorEnv: merged.mirrorEnv,
    overrides: merged.policy,
  });

  console.log('── Approaches 1 & 2: Sandbox probes ──');
  console.log(`   baseline readonly (${policy.filesystem?.readonlyPaths?.length ?? 0}):`);
  for (const p of policy.filesystem?.readonlyPaths ?? []) console.log(`     - ${p}`);
  console.log('');

  const results: Array<ProbeCase & { node: string; npm: string; preparedNode: string; readonlyCount: number }> = [];

  for (const probe of CASES) {
    console.log(`▶ ${probe.name} (expandMirror=${probe.expandMirror}, nodeViaCmd=${probe.nodeViaCmd})`);
    const r = await runCase(probe, merged, timeoutMs);
    console.log(`   readonly paths: ${r.readonlyCount}`);
    console.log(`   prepared: ${r.preparedNode}`);
    console.log(`   node: ${r.node}`);
    console.log(`   npm:  ${r.npm}\n`);
    results.push({ ...probe, ...r });
  }

  const reportPath = path.join(process.cwd(), '.wabox', 'diagnostics', 'node-probe.json');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    JSON.stringify({ runAt: new Date().toISOString(), initPaths, results }, null, 2),
    'utf8',
  );

  console.log('── Summary ──');
  for (const r of results) {
    const nodeOk = r.node.startsWith('PASS');
    const npmOk = r.npm.startsWith('PASS');
    console.log(`   ${nodeOk && npmOk ? '✓' : '✗'} ${r.name}: node=${r.node.split(' ')[0]} npm=${r.npm.split(' ')[0]}`);
  }
  console.log(`\nReport: ${reportPath}`);

  const winner = results.find((r) => r.node.startsWith('PASS'));
  if (winner) {
    console.log(`\nRecommended env for this host:`);
    if (winner.expandMirror) console.log('   WABOX_EXPAND_NODE_MIRROR=1');
    if (winner.nodeViaCmd) console.log('   WABOX_NODE_VIA_CMD=1');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
