/**
 * MXC DACL fallback walks policy paths on spawn. Drive roots (e.g. D:\) from PATH
 * discovery cause extreme slow spawns or apparent hangs.
 */
export function isOverlyBroadFilesystemPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return true;

  const withoutTrailing = trimmed.replace(/[/\\]+$/, '');
  // Bare drive roots: C:, C:\, D:, D:/
  if (/^[a-zA-Z]:\\?$/i.test(withoutTrailing)) return true;

  return false;
}

export function sanitizeMirroredReadonlyPaths(paths: string[]): {
  kept: string[];
  dropped: string[];
} {
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const p of paths) {
    if (isOverlyBroadFilesystemPath(p)) {
      dropped.push(p);
    } else {
      kept.push(p);
    }
  }

  return { kept, dropped };
}
