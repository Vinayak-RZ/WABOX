import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WaboxPolicy } from '../domain/types.js';
import { resolveMxcHostPrepPath } from './mxc-bin-path.js';

const execFileAsync = promisify(execFile);

export interface DriveAceStatus {
  driveRoot: string;
  appContainerAceCount: number;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface NullDeviceStatus {
  ok: boolean;
  exitCode: number;
  skipped?: boolean;
  error?: string;
  rawJson?: string;
}

export interface HostPrepReport {
  drives: DriveAceStatus[];
  nullDevice: NullDeviceStatus;
  recommendations: string[];
}

/** Extract unique drive roots (e.g. `D:\`) from filesystem policy paths. */
export function uniqueDriveRoots(paths: string[]): string[] {
  const roots = new Set<string>();
  for (const raw of paths) {
    const root = driveRootFromPath(raw);
    if (root) roots.add(root);
  }
  return [...roots].sort((a, b) => a.localeCompare(b));
}

export function driveRootFromPath(rawPath: string): string | undefined {
  const trimmed = rawPath.trim();
  const match = trimmed.match(/^([a-zA-Z]:)(?:[/\\]|$)/);
  if (!match) return undefined;
  return `${match[1]}\\`;
}

export function collectPolicyDriveRoots(policy: WaboxPolicy): string[] {
  const paths = [
    ...(policy.filesystem?.readonlyPaths ?? []),
    ...(policy.filesystem?.readwritePaths ?? []),
    ...(policy.filesystem?.deniedPaths ?? []),
  ];
  if (policy.filesystem?.workspacePath) {
    paths.push(policy.filesystem.workspacePath);
  }
  return uniqueDriveRoots(paths);
}

async function countAppContainerAcesOnDrive(driveRoot: string): Promise<number> {
  const escaped = driveRoot.replace(/'/g, "''");
  const ps = [
    `(Get-Acl '${escaped}').Access`,
    "| Where-Object { -not $_.IsInherited -and ($_.IdentityReference -match 'APPLICATION PACKAGES') }",
    '| Measure-Object | Select-Object -ExpandProperty Count',
  ].join(' ');

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { timeout: 30_000, windowsHide: true },
  );
  return Number.parseInt(stdout.trim(), 10) || 0;
}

export async function checkDriveRootAce(driveRoot: string): Promise<DriveAceStatus> {
  if (process.platform !== 'win32') {
    return {
      driveRoot,
      appContainerAceCount: 0,
      ok: true,
      skipped: true,
      error: 'not Windows',
    };
  }

  try {
    const count = await countAppContainerAcesOnDrive(driveRoot);
    return {
      driveRoot,
      appContainerAceCount: count,
      ok: count >= 2,
    };
  } catch (error) {
    return {
      driveRoot,
      appContainerAceCount: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyNullDevice(): Promise<NullDeviceStatus> {
  if (process.platform !== 'win32') {
    return { ok: true, exitCode: 0, skipped: true, error: 'not Windows' };
  }

  const hostPrep = resolveMxcHostPrepPath();
  try {
    const { stdout } = await execFileAsync(hostPrep, ['verify-null-device', '--json'], {
      timeout: 60_000,
      windowsHide: true,
    });
    return { ok: true, exitCode: 0, rawJson: stdout.trim() };
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const parsed =
      typeof err.code === 'number'
        ? err.code
        : Number.parseInt(String(err.code ?? ''), 10);
    const exitCode = Number.isFinite(parsed) ? parsed : 1;
    return {
      ok: false,
      exitCode,
      error: err.message,
      rawJson: err.stdout?.trim(),
    };
  }
}

export function buildHostPrepRecommendations(
  drives: DriveAceStatus[],
  nullDevice: NullDeviceStatus,
): string[] {
  const recs: string[] = [];

  for (const drive of drives) {
    if (drive.skipped) continue;
    if (!drive.ok) {
      recs.push(
        `Run elevated once: wxc-host-prep prepare-system-drive --target ${drive.driveRoot}`,
      );
    }
  }

  if (!nullDevice.skipped && !nullDevice.ok) {
    recs.push(
      'Run elevated after each reboot: wxc-host-prep prepare-null-device',
    );
  }

  return recs;
}

export async function runHostPrepReport(policy: WaboxPolicy): Promise<HostPrepReport> {
  const driveRoots = collectPolicyDriveRoots(policy);
  const drives = await Promise.all(driveRoots.map((d) => checkDriveRootAce(d)));
  const nullDevice = await verifyNullDevice();
  const recommendations = buildHostPrepRecommendations(drives, nullDevice);

  const nonSystemDrives = driveRoots.filter(
    (d) => d.toUpperCase() !== `${process.env.SystemDrive ?? 'C:'}\\`.toUpperCase(),
  );
  if (nonSystemDrives.length > 0) {
    recommendations.push(
      `Workspace or tools on ${nonSystemDrives.join(', ')}: first spawn after reboot may take 4–10 min (MXC DACL walk) with no stdout/stderr. Set WABOX_EXEC_TIMEOUT_MS=600000 or warm up once.`,
    );
  }

  return { drives, nullDevice, recommendations };
}

export interface SpawnHangContext {
  elapsedMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  policy: WaboxPolicy;
  driveAceOk?: Map<string, boolean>;
}

/** Context-aware hint when wxc-exec produces no output for a long time. */
export function suggestSpawnHangFix(ctx: SpawnHangContext): string {
  const { elapsedMs, stdoutBytes, stderrBytes, policy, driveAceOk } = ctx;

  if (stdoutBytes > 0 || stderrBytes > 0) {
    return 'wxc-exec produced output — waiting for process exit…';
  }

  if (elapsedMs <= 60_000) {
    return 'wxc-exec starting (DACL setup on policy paths — normal on cold boot)…';
  }

  const drives = collectPolicyDriveRoots(policy);
  const missingAces = drives.filter((d) => driveAceOk?.get(d) === false);
  if (missingAces.length > 0) {
    return `Missing AppContainer ACEs on ${missingAces.join(', ')}. Run elevated: wxc-host-prep prepare-system-drive --target ${missingAces[0]}`;
  }

  const systemDrive = `${process.env.SystemDrive ?? 'C:'}\\`.toUpperCase();
  const hasNonSystemDrive = drives.some((d) => d.toUpperCase() !== systemDrive);
  if (hasNonSystemDrive) {
    return 'Still in wxc-exec — first spawn on non-system-drive paths (e.g. D:\\) often takes 4–10 min after reboot with zero output. Increase WABOX_EXEC_TIMEOUT_MS or wait once.';
  }

  return 'Still in wxc-exec (DACL recovery on policy paths). First spawn after reboot can take several minutes with no output.';
}
