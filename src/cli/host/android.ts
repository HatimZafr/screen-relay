import { mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { Failure } from '../output.js';
import { run } from './common.js';

export function androidDevice(explicit?: string): { serial: string; socket: string } {
  const scheme = 'localfilesystem:';
  const socket = process.env.ADB_SERVER_SOCKET || scheme + join(homedir(), '.screen-relay-adb', 'server.sock');
  const path = socket.slice(scheme.length);
  const fix = 'Use the private ADB socket in the Termux setup guide.';
  if (!socket.startsWith(scheme) || !isAbsolute(path) || Buffer.byteLength(path) >= 108) {
    throw new Failure('invalid_input', 'ADB needs a private local filesystem socket', fix);
  }
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = statSync(directory);
  if (info.uid !== process.getuid?.() || info.mode & 0o077) {
    throw new Failure('forbidden', `The ADB socket directory is accessible to other Android apps: ${directory}`, fix);
  }
  const result = run(['adb', 'devices'], { env: { ...process.env, ADB_SERVER_SOCKET: socket }, timeout: 5000 });
  if (result.status !== 0) {
    throw new Failure('component_failed', 'Cannot list Android devices with ADB', 'Run `adb devices` in Termux and check the local ADB server.', { log: result.stderr?.trim() });
  }
  const ready = result.stdout.split(/\r?\n/).flatMap((line) => {
    const match = /^(\S+)\s+device\s*$/.exec(line);
    return match ? [match[1]] : [];
  });
  const serial = explicit || process.env.ANDROID_SERIAL;
  if (serial && ready.includes(serial)) return { serial, socket };
  if (!serial && ready.length === 1) return { serial: ready[0], socket };
  if (!serial && ready.length > 1) {
    throw new Failure('missing_input', 'More than one Android device is ready', 'Pass a serial from `adb devices` with --output.', { devices: ready });
  }
  throw new Failure('missing_dependency', serial ? `Android device ${serial} is unavailable` : 'No authorized Android device is ready',
    'Pair and connect from Termux with Wireless debugging, then check `adb devices`.');
}
