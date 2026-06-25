/** Normalize Windows paths for stable comparison and MXC policy lists. */
export function normalizePath(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

export function unionPaths(...groups: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const group of groups) {
    if (!group) continue;
    for (const raw of group) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = normalizePath(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result;
}

export function expandWorkspaceDenials(workspacePath: string): string[] {
  const base = workspacePath.replace(/[/\\]+$/, '');
  return [`${base}\\.env`, `${base}/.env`];
}
