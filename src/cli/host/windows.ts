import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Failure } from '../output.js';
import { run } from './common.js';

/** Root of the MSYS2 install that `screen-relay install` sets up on Windows. */
export const MSYS2_ROOT = 'C:\\msys64';

/** MSYS2's bash, which runs build commands in its UCRT64 environment. Every caller reaches it through msys2Shell, which checks the installation first. */
const MSYS2_SHELL = `${MSYS2_ROOT}\\usr\\bin\\bash.exe`;

/** MSYS2's UCRT64 libraries, which relay-engine loads on Windows. */
const MSYS2_LIBRARIES = `${MSYS2_ROOT}\\ucrt64\\bin`;

/** The directories that the MSYS2 shell searches for the commands setup runs, in its own search order. */
const MSYS2_SEARCH = ['usr/local/bin', 'usr/bin', 'ucrt64/bin'];

/** The PATH that setup gives the MSYS2 shell, so it searches only the directories setup checks and whatever its login profile adds is not used. */
export const MSYS2_PATH = MSYS2_SEARCH.map((directory) => `/${directory}`).join(':');

/** The files that the MSYS2 login profile reads, which `bash -l` runs before the command setup passes it. */
const MSYS2_LOGIN_FILES = ['etc\\profile', 'etc\\bash.bashrc'].map((file) => `${MSYS2_ROOT}\\${file}`);

/** The MSYS2 paths that setup runs or loads: the shell, the config its login profile reads, and every searched directory with the directories above it that could replace it. */
export const MSYS2_CHECKED = [...new Set([MSYS2_ROOT, `${MSYS2_ROOT}\\etc`, `${MSYS2_ROOT}\\etc\\profile.d`, MSYS2_SHELL, ...MSYS2_LOGIN_FILES,
  ...MSYS2_SEARCH.flatMap((directory) => directory.split('/').map((_, index, parts) => `${MSYS2_ROOT}\\${parts.slice(0, index + 1).join('\\')}`))])];

/** Owners that setup trusts besides the signed-in account: SYSTEM, Administrators, and TrustedInstaller. */
const TRUSTED_SIDS = new Set(['S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464']);

/** FILE_WRITE_DATA, FILE_DELETE_CHILD, DELETE, WRITE_DAC, WRITE_OWNER, GENERIC_ALL, and GENERIC_WRITE: the rights that let an account replace a path or alter the files in it. Creating a subdirectory cannot replace the shell, so FILE_APPEND_DATA is not one of them on a directory. */
const REPLACE_RIGHTS = 0x2 | 0x40 | 0x10000 | 0x40000 | 0x80000 | 0x10000000 | 0x40000000;

/** The rights that let an account alter a path, by kind of object: on a file FILE_APPEND_DATA adds to its contents, which is how another account runs code from a profile that `bash -l` reads, while on a directory the same bit only adds a subdirectory. */
const WRITE_RIGHTS: Record<AclObject['kind'], number> = { file: REPLACE_RIGHTS | 0x4, directory: REPLACE_RIGHTS };

/** Rules that only apply to objects their trustee creates; who may create them is already settled by the parent's rules. */
const CREATOR_SIDS = new Set(['S-1-3-0', 'S-1-3-1', 'S-1-3-4']);

/** The decision this process made about the MSYS2 installation, so setup checks the tree once rather than for every step. */
let installation: Msys2Installation | undefined;

/** One access rule as PowerShell reports it: the trustee's security identifier, its account name, and the rights it is granted. */
export type AclRule = { sid: string; name: string; rights: number };

/** The owner and allow rules of one path, and whether it is a directory or a file. */
export type AclObject = { path: string; kind: 'file' | 'directory'; owner: string; ownerName: string; rules: AclRule[] };

/** The allow rules of the MSYS2 paths, and the security identifier of the signed-in account. */
export type AclProbe = { current: string; objects: AclObject[] };

/** What setup found at the MSYS2 root: an installation it runs, nothing, or a tree it will not run. */
export type Msys2Installation =
  | { state: 'missing'; root: string }
  | { state: 'trusted'; root: string; shell: string }
  | { state: 'untrusted'; root: string; reason: string; repair?: string[] };

/** The MSYS2 states that stop setup. */
export type Msys2Problem = Exclude<Msys2Installation, { state: 'trusted' }>;

/** The environment that runs relay-engine, with MSYS2's UCRT64 libraries first on PATH on Windows. Other platforms get the environment unchanged. */
export function engineEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (process.platform !== 'win32' || msys2Installation().state !== 'trusted') return env;
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  return { ...env, [key]: [MSYS2_LIBRARIES, env[key]].filter(Boolean).join(';') };
}

/** The directory to start the engine in on Windows: its own, so Windows does not search the caller's folder for the engine's DLLs. Undefined elsewhere. */
export function engineWorkingDirectory(engine: string): string | undefined {
  return process.platform === 'win32' ? dirname(engine) : undefined;
}

/** The MSYS2 installation on this machine, decided once per process. Call forgetMsys2Installation after setup changes the tree. */
export function msys2Installation(): Msys2Installation {
  installation ??= detectMsys2();
  return installation;
}

/** Drops the remembered decision, so the next check reads the installation again. */
export function forgetMsys2Installation(): void {
  installation = undefined;
}

/** MSYS2's bash, after checking that setup trusts the installation it comes from. */
export function msys2Shell(): string {
  const found = msys2Installation();
  if (found.state === 'trusted') return found.shell;
  throw msys2Failure(found);
}

/** The failure that says setup will not run the MSYS2 tree it found, and what to do about it. The hint carries no backticks, because the CLI prints a backticked command in place of the hint. */
export function msys2Failure(found: Msys2Problem): Failure {
  if (found.state === 'untrusted') return new Failure('missing_dependency', `MSYS2 at ${found.root} is not a trusted installation`, msys2Fix(found));
  return new Failure('missing_dependency', 'MSYS2 is not installed', 'Install MSYS2 from https://www.msys2.org, then run screen-relay install again.');
}

/** What to do about an MSYS2 tree that setup does not trust: remove the rights it inherits from C:\ when only those are wrong, else delete it. */
export function msys2Fix(found: Extract<Msys2Installation, { state: 'untrusted' }>): string {
  const reinstall = `delete ${found.root} and run screen-relay install again`;
  if (!found.repair) return `${found.reason} To fix it, ${reinstall}.`;
  const command = found.repair.map((part, index) => (index > 0 && /[()*]/.test(part) ? `"${part}"` : part)).join(' ');
  return `${found.reason} If you installed MSYS2 there and only you use it, remove the rights it inherits from C:\\ with: ${command}. Otherwise ${reinstall}.`;
}

/** Removes the rights the MSYS2 tree inherits from C:\, which let every user add files to it, and leaves full control to SYSTEM, Administrators and this account and read access to Users. Returns false when there is nothing to repair or icacls fails. */
export function repairMsys2(): boolean {
  const found = msys2Installation();
  if (found.state !== 'untrusted' || !found.repair) return false;
  const [, ...args] = found.repair;
  const ok = run([systemTool('icacls.exe'), ...args], { timeout: 120000 }).status === 0;
  forgetMsys2Installation();
  return ok;
}

/** Whether the signed-in account, SYSTEM, Administrators, or TrustedInstaller owns every MSYS2 path that setup runs or loads, and no other account can write to it. */
export function trustedAcl(probe: AclProbe): { trusted: true } | { trusted: false; reason: string; owned: boolean } {
  const trusted = (sid: string) => Boolean(sid) && (sid === probe.current || TRUSTED_SIDS.has(sid));
  for (const object of probe.objects) {
    if (!trusted(object.owner)) return { trusted: false, reason: `${object.path} is owned by ${object.ownerName}.`, owned: false };
    for (const rule of object.rules) {
      if (!(rule.rights & WRITE_RIGHTS[object.kind]) || trusted(rule.sid) || CREATOR_SIDS.has(rule.sid)) continue;
      return { trusted: false, reason: `${object.path} lets ${rule.name} write to it.`, owned: true };
    }
  }
  return { trusted: true };
}

/** Reads what the machine has at the MSYS2 root and, when a shell is there, whether setup trusts the tree it came from. */
function detectMsys2(): Msys2Installation {
  if (!existsSync(MSYS2_SHELL)) return { state: 'missing', root: MSYS2_ROOT };
  const probe = aclProbe();
  if (!probe) return { state: 'untrusted', root: MSYS2_ROOT, reason: `screen-relay could not read who owns ${MSYS2_ROOT}.` };
  const verdict = trustedAcl(probe);
  if (verdict.trusted) return { state: 'trusted', root: MSYS2_ROOT, shell: MSYS2_SHELL };
  return { state: 'untrusted', root: MSYS2_ROOT, reason: verdict.reason, repair: msys2Repair(verdict.owned, probe.current) };
}

/** The repair for a tree whose owners setup trusts, or undefined when only deleting it helps; any account's SID works, including one from Entra ID. */
export function msys2Repair(owned: boolean, account: string): string[] | undefined {
  return owned && /^S-\d+(-\d+)+$/.test(account) ? repairCommand(account) : undefined;
}

/** The icacls command that replaces the MSYS2 root's inherited rules with full control for SYSTEM, Administrators and this account and read access for Users; Windows passes them on to the tree. */
export function repairCommand(account: string): string[] {
  return ['icacls', MSYS2_ROOT, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', `*${account}:(OI)(CI)F`, '*S-1-5-32-545:(OI)(CI)RX'];
}

/** Reads the owners and allow rules of the MSYS2 paths from PowerShell, or null when it cannot report them. */
function aclProbe(): AclProbe | null {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    `$paths = @(${MSYS2_CHECKED.map((path) => `'${path}'`).join(', ')})`,
    '$objects = @(foreach ($path in $paths) {',
    '  if (-not (Test-Path -LiteralPath $path)) { continue }',
    '  $isDirectory = Test-Path -LiteralPath $path -PathType Container',
    '  $acl = if ($isDirectory) { [System.IO.Directory]::GetAccessControl($path) } else { [System.IO.File]::GetAccessControl($path) }',
    '  $owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier])',
    '  $ownerName = try { $owner.Translate([System.Security.Principal.NTAccount]).Value } catch { $owner.Value }',
    '  $rules = @($acl.Access | Where-Object { $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow } | ForEach-Object {',
    '    $sid = if ($_.IdentityReference -is [System.Security.Principal.SecurityIdentifier]) { $_.IdentityReference } else { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]) }',
    '    $name = try { $sid.Translate([System.Security.Principal.NTAccount]).Value } catch { $sid.Value }',
    '    [pscustomobject]@{ sid = $sid.Value; name = $name; rights = [int]$_.FileSystemRights }',
    '  })',
    '  [pscustomobject]@{ path = $path; directory = $isDirectory; owner = $owner.Value; ownerName = $ownerName; rules = $rules }',
    '})',
    '$current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
    '[pscustomobject]@{ current = $current; objects = $objects } | ConvertTo-Json -Depth 5 -Compress',
  ].join('\n');
  const result = run([systemTool('WindowsPowerShell', 'v1.0', 'powershell.exe'), '-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20000 });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    const decoded = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()) as { current?: unknown; objects?: RawObject | RawObject[] };
    const objects = (Array.isArray(decoded.objects) ? decoded.objects : decoded.objects ? [decoded.objects] : []).map((object): AclObject => ({
      path: String(object.path ?? ''),
      kind: object.directory === true ? 'directory' : 'file',
      owner: String(object.owner ?? ''),
      ownerName: String(object.ownerName ?? object.owner ?? ''),
      rules: (Array.isArray(object.rules) ? object.rules : object.rules ? [object.rules] : []).map((rule) => ({
        sid: String(rule.sid ?? ''),
        name: String(rule.name ?? rule.sid ?? ''),
        rights: Number(rule.rights ?? 0),
      })),
    }));
    return { current: String(decoded.current ?? ''), objects };
  } catch {
    return null;
  }
}

/** A path from the probe as PowerShell wrote it, before the shape is checked. */
type RawObject = { path?: unknown; directory?: unknown; owner?: unknown; ownerName?: unknown; rules?: RawRule | RawRule[] };

/** One rule from the probe as PowerShell wrote it, before the shape is checked. */
type RawRule = { sid?: unknown; name?: unknown; rights?: unknown };

/** Absolute path of a tool in the Windows system folder, so a same-named file in the working directory cannot stand in for it. */
function systemTool(...parts: string[]): string {
  return join(process.env.SystemRoot || 'C:\\Windows', 'System32', ...parts);
}

/** Absolute path of winget, or null when LOCALAPPDATA is not set. */
export function wingetPath(): string | null {
  return process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'winget.exe') : null;
}

/** The Windows session id of this process, or null when PowerShell cannot report it. */
export function windowsSessionId(): number | null {
  const result = run([systemTool('WindowsPowerShell', 'v1.0', 'powershell.exe'), '-NoProfile', '-NonInteractive', '-Command', '[System.Diagnostics.Process]::GetCurrentProcess().SessionId'], { timeout: 15000 });
  const text = result.stdout?.trim() ?? '';
  return result.status === 0 && /^\d+$/.test(text) ? Number(text) : null;
}

/** The creation time of a Windows process as a FILETIME string, or null when it cannot be read. */
export function windowsStartTime(pid: number): string | null {
  const result = run([systemTool('WindowsPowerShell', 'v1.0', 'powershell.exe'), '-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`], { timeout: 15000 });
  const text = result.stdout?.trim() ?? '';
  return result.status === 0 && /^\d+$/.test(text) ? text : null;
}

/** Ends a process and every process it started. A failure is ignored because the process may already be gone. */
export function killTree(pid: number): void {
  run([systemTool('taskkill.exe'), '/PID', String(pid), '/T', '/F'], { timeout: 10000 });
}
