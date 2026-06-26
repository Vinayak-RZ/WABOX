import { createAgentSandbox, getSupportStatus } from '../src/index.js';

async function main(): Promise<void> {
  const status = getSupportStatus();
  console.log('Support status:', status);

  if (!status.supported) {
    console.error('WABOX is not supported on this host.');
    for (const err of status.errors) {
      console.error(' -', err);
    }
    process.exit(1);
  }

  const sandbox = createAgentSandbox({
    preset: 'node-dev',
    agentId: 'minimal-example',
    sessionLabel: 'MVP smoke run',
    // Fewer MXC DACL paths than full PATH mirror — use true for maximum tool coverage.
    mirrorEnv: 'minimal',
    policy: {
      filesystem: {
        workspacePath: process.cwd(),
      },
    },
  });

  console.log('Session:', sandbox.sessionId);
  console.log('Mirrored tools:', sandbox.mirroredEnv.toolsFound.join(', ') || '(none detected on PATH)');
  console.log('Mirror mode:', sandbox.mirroredEnv.mirrorMode ?? 'full');

  const install = await sandbox.exec('node -e "console.log(1+1)"', { label: 'smoke' });
  console.log('exec exit:', install.exitCode);
  console.log('stdout:', install.stdout.trim());

  const log = await sandbox.destroy();
  console.log('Session log written with', log.actions.length, 'action(s)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
