import { getAvailableToolsPolicy } from '@microsoft/mxc-sdk';

export function discoverToolReadonlyPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  return getAvailableToolsPolicy(env).readonlyPaths ?? [];
}
