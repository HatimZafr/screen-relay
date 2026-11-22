import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Failure } from '../output.js';

export const DEFAULT_PORT = 8080;
export const COMPONENTS: string[] = ['display', 'dbus', 'desktop', 'engine', 'apps'];
export const LAUNCHER_DIR = dirname(fileURLToPath(import.meta.url));

declare const __RELAY_VERSION__: string;
/** Version of this CLI, or 0.0.0 in a bundle built without one. */
export const VERSION = typeof __RELAY_VERSION__ === 'string' ? __RELAY_VERSION__ : '0.0.0';

/** Directory that holds the engine built for this CLI version. */
export function engineDirectory(): string {
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'screen-relay', 'engine', VERSION);
}

export type HostArgs = Record<string, unknown> & { command: string; json: boolean; name: string; backend?: string; output?: string; signal?: AbortSignal };

export function isLinux(): boolean {
  return process.platform.startsWith('linux');
}

export function isTermux(): boolean {
  return process.platform === 'android';
}

export function termuxPrefix(): string {
  return process.env.PREFIX || dirname(dirname(process.execPath));
}

export function requireHost(): void {
  if (!isLinux() && !isTermux() && process.platform !== 'darwin' && process.platform !== 'win32') {
    throw new Failure('unsupported_platform', 'Host commands require Linux, Termux, macOS, or Windows',
      'Use --url to run client commands against a session on another machine.');
  }
}

export function which(program: string): string | undefined {
  if (program.includes('/') || (process.platform === 'win32' && program.includes('\\'))) {
    try {
      if (statSync(program).isFile()) { accessSync(program, constants.X_OK); return program; }
    } catch {}
    return undefined;
  }
  const names = process.platform === 'win32' && !extname(program) ? [`${program}.exe`] : [program];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (process.platform === 'win32' && !directory) continue;
    for (const name of names) {
      const candidate = join(directory || '.', name);
      try {
        if (statSync(candidate).isFile()) {
          accessSync(candidate, constants.X_OK);
          return candidate;
        }
      } catch {}
    }
  }
  return undefined;
}

/** Clears Linux capabilities or leaves the command unchanged on macOS and Windows. */
export function clearedCommand(command: string[]): [string, ...string[]] {
  if (process.platform === 'darwin' || process.platform === 'win32') return command as [string, ...string[]];
  return ['setpriv', '--inh-caps=-all', '--ambient-caps=-all', ...command];
}

export function spawnCleared(command: string[], options: SpawnOptions = {}): ChildProcess {
  const [program, ...args] = clearedCommand(command);
  return spawn(program, args, options);
}

export function run(command: string[], options: SpawnOptions = {}) {
  return spawnSync(command[0], command.slice(1), { encoding: 'utf8', ...options });
}
