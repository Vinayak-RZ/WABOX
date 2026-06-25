const POWERSHELL_PATTERN = /(^|[\s|&])(powershell(?:\.exe)?|pwsh(?:\.exe)?)\b/i;

export function commandRequiresWindowsUi(command: string): boolean {
  return POWERSHELL_PATTERN.test(command);
}
