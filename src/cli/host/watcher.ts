import type { Readable } from 'node:stream';
import { Failure } from '../output.js';
import { LAUNCHER_DIR, spawnCleared } from './common.js';

const WATCHER_SCRIPT = `
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
let readyFd = Number(process.argv[1]);
const restart = process.argv[2] === 'restart';
const command = process.argv.slice(3);
const caps = 'import ctypes,os,sys; ctypes.CDLL(None).prctl(47,4,0,0,0); os.execvp(sys.argv[0],sys.argv)';
const stopping = { value: false };
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { stopping.value = true; });
function startTime(pid) {
  if (process.platform === 'darwin') {
    try {
      const output = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 2000, env: { ...process.env, LC_ALL: 'C' } }).trim();
      const started = Date.parse(output);
      return Number.isNaN(started) ? output : String(started);
    } catch { return null; }
  }
  try {
    const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(/\\s+/);
    return fields[0] === 'Z' ? null : fields[19] ?? null;
  } catch { return null; }
}
function alive(record) { return Boolean(record) && startTime(record.pid) === record.start; }
function present(record) {
  if (!record || typeof record.pid !== 'number') return false;
  try { process.kill(record.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
function sessionSupervisor() {
  try { return JSON.parse(fs.readFileSync(process.env.SCREEN_RELAY_SESSION + '/session.json', 'utf8')).supervisor; }
  catch { return null; }
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function sendReady(data) {
  if (!Number.isInteger(readyFd) || readyFd < 0) return;
  fs.writeSync(readyFd, JSON.stringify(data) + '\\n');
  fs.closeSync(readyFd);
  readyFd = -1;
}
function ownGroup() {
  try {
    const group = Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8', timeout: 2000, env: { ...process.env, LC_ALL: 'C' } }).trim());
    return Number.isInteger(group) && group > 0 ? group : process.pid;
  } catch { return process.pid; }
}
/** Reads ps output from a child in its own group, so the probe is not counted as a group member. */
function psOutput(args) {
  return new Promise((resolve) => {
    const child = spawn('ps', args, { detached: true, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, LC_ALL: 'C' } });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve(null); }, 2000);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.once('error', () => { clearTimeout(timer); resolve(null); });
    child.once('close', (code) => { clearTimeout(timer); resolve(code === 0 ? output : null); });
  });
}
async function groupMembers(group) {
  const output = await psOutput(['-ax', '-o', 'pgid=', '-o', 'stat=']);
  if (output === null) return -1;
  let count = 0;
  for (const line of output.split('\\n')) {
    const fields = line.trim().split(/\\s+/);
    if (fields.length < 2 || fields[1].startsWith('Z')) continue;
    if (Number(fields[0]) === group) count++;
  }
  return count;
}
function launch(detached) {
  const childCommand = process.platform === 'linux' || process.platform === 'android' ? ['setpriv', '--inh-caps=-all', '--ambient-caps=-all', ...command] : command;
  const child = spawn(childCommand[0], childCommand.slice(1), {
    cwd: os.homedir(), env: process.env, detached: detached,
    stdio: ['ignore', 'inherit', 'inherit']
  });
  return new Promise((resolve, reject) => {
    child.once('spawn', () => resolve(child));
    child.once('error', reject);
  });
}
/** Runs the app as a member of this process's group and stops that group when the session ends. */
async function hold(supervisor) {
  const group = ownGroup();
  let child;
  try {
    child = await launch(false);
  } catch (error) {
    if (readyFd >= 0) {
      sendReady({ error: String(error) });
      return 1;
    }
    console.log('screen-relay: cannot start ' + command[0] + ': ' + String(error));
    return 1;
  }
  const exited = child.exitCode !== null ? child.exitCode : child.signalCode !== null ? 1 : await Promise.race([
    new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1))),
    sleep(1000).then(() => null),
  ]);
  if (readyFd >= 0) sendReady(exited === null ? { pid: child.pid } : { pid: child.pid, exited });
  else if (exited === null) console.log('screen-relay: started ' + command[0] + ' (pid ' + child.pid + ')');
  let checked = 0;
  let counted = 0;
  let members = 1;
  while (!stopping.value) {
    if (!present(supervisor)) break;
    if (Date.now() - checked >= 5000) {
      if (!alive(supervisor)) break;
      checked = Date.now();
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      if (Date.now() - counted >= 500) {
        members = await groupMembers(group);
        counted = Date.now();
      }
      if (members >= 0 && members <= 1) return 0;
    }
    await sleep(100);
  }
  try { process.kill(-group, 'SIGTERM'); } catch {}
  await sleep(200);
  try { process.kill(-group, 'SIGKILL'); } catch {}
  return 0;
}
async function main() {
  let supervisor = sessionSupervisor();
  let processChild = null;
  let delay = 1000;
  try {
    if (!restart) return await hold(supervisor);
    while (!stopping.value && alive(supervisor)) {
      const started = Date.now();
      processChild = null;
      try {
        processChild = await launch(true);
      } catch (error) {
        if (readyFd >= 0) {
          sendReady({ error: String(error) });
          return 1;
        }
        console.log('screen-relay: cannot restart ' + command[0] + ': ' + String(error));
      }
      if (processChild && processChild.pid) {
        if (readyFd >= 0) sendReady({ pid: processChild.pid });
        else console.log('screen-relay: restarted ' + command[0] + ' (pid ' + processChild.pid + ')');
        while (!stopping.value && alive(supervisor) && processChild.exitCode === null && processChild.signalCode === null) await sleep(100);
        if (!stopping.value && alive(supervisor) && Date.now() - started >= 60000) delay = 1000;
        if (!stopping.value && alive(supervisor)) console.log('screen-relay: ' + command[0] + ' exited with code ' + processChild.exitCode + '; restarting in ' + delay / 1000 + 's');
      }
      if (stopping.value || !alive(supervisor)) break;
      await sleep(delay);
      delay = Math.min(delay * 2, 30000);
      supervisor = sessionSupervisor();
    }
  } finally {
    if (readyFd >= 0) fs.closeSync(readyFd);
    if (restart && processChild && processChild.pid && processChild.exitCode === null && processChild.signalCode === null) {
      const ended = new Promise(resolve => processChild.once('exit', resolve));
      try { process.kill(-processChild.pid, 'SIGTERM'); } catch {}
      await sleep(200);
      try { process.kill(-processChild.pid, 'SIGKILL'); } catch {}
      await ended;
    }
  }
  return 0;
}
main().then(code => { process.exitCode = code; });
`;

export async function startWatcher(command: string[], env: NodeJS.ProcessEnv, logFd: number, signal: AbortSignal | undefined, restart: boolean): Promise<{ pid: number; exited?: number }> {
  const watcher = spawnCleared([
    process.execPath,
    '--input-type=module',
    '-e',
    WATCHER_SCRIPT,
    '3',
    restart ? 'restart' : 'once',
    ...command,
  ], {
    cwd: LAUNCHER_DIR,
    env,
    detached: true,
    signal,
    stdio: ['ignore', logFd, logFd, 'pipe'],
  });
  const stream = watcher.stdio[3] as Readable;
  let exited = false;
  watcher.once('exit', () => { exited = true; });
  const result = await new Promise<string>((resolve) => {
    let data = '';
    const timeout = setTimeout(() => resolve(''), 10000);
    stream.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      if (data.includes('\n')) {
        clearTimeout(timeout);
        resolve(data.split(/\r?\n/)[0]);
      }
    });
    watcher.once('exit', () => {
      clearTimeout(timeout);
      resolve(data.split(/\r?\n/)[0] ?? '');
    });
    watcher.once('error', () => {
      clearTimeout(timeout);
      resolve('');
    });
  });
  stream.destroy();
  if (!result) {
    watcher.kill('SIGTERM');
    if (!exited) await new Promise<void>((resolve) => watcher.once('exit', () => resolve()));
    throw new Failure('timeout', 'App watcher did not report startup', 'Read `screen-relay logs apps`.');
  }
  let response: { pid?: number; exited?: number; error?: string };
  try {
    response = JSON.parse(result) as { pid?: number; exited?: number; error?: string };
  } catch {
    throw new Failure('spawn_failed', 'App watcher exited before starting the app', 'Read `screen-relay logs apps`.');
  }
  if (response.error) throw new Failure('spawn_failed', `Cannot start ${command[0]}: ${response.error}`);
  if (typeof response.pid !== 'number') throw new Failure('spawn_failed', 'App watcher exited before starting the app', 'Read `screen-relay logs apps`.');
  watcher.unref();
  return { pid: response.pid, exited: response.exited };
}
