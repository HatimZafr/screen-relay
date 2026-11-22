import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';

const root = fileURLToPath(new URL('../..', import.meta.url));
const directory = mkdtempSync(join(root, '.apps-test-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const bundle = buildSync({
  stdin: {
    contents: "export { startWatcher } from './src/cli/host/watcher.ts'; export { identity } from './src/cli/host/state.ts'; export { cmdRun } from './src/cli/host/session_commands.ts';",
    resolveDir: root,
  },
  bundle: true,
  external: ['yaml'],
  platform: 'node',
  format: 'esm',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  write: false,
});
const bundlePath = join(directory, 'apps.mjs');
writeFileSync(bundlePath, bundle.outputFiles[0].contents);
const { startWatcher, identity, cmdRun } = await import(pathToFileURL(bundlePath).href);

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

const parentOf = (pid) => Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim());

async function waitFor(check, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
}

async function session(name) {
  const path = join(directory, name);
  mkdirSync(path, { recursive: true });
  const supervisor = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await new Promise((resolve, reject) => { supervisor.once('spawn', resolve); supervisor.once('error', reject); });
  writeFileSync(join(path, 'session.json'), JSON.stringify({ state: 'ready', supervisor: identity(supervisor.pid) }));
  const log = openSync(join(path, 'apps.log'), 'a', 0o600);
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (supervisor.exitCode === null && supervisor.signalCode === null) {
      supervisor.kill('SIGKILL');
      await new Promise((resolve) => supervisor.once('exit', resolve));
    }
    closeSync(log);
  };
  return { path, env: { ...process.env, SCREEN_RELAY_SESSION: path }, log, stop };
}

test('an app stops when its session supervisor exits', async () => {
  const desk = await session('stop-app');
  let pid;
  try {
    ({ pid } = await startWatcher([process.execPath, '-e', 'setInterval(() => {}, 1000)'], desk.env, desk.log, undefined, false));
    assert.equal(alive(pid), true);
    await desk.stop();
    assert.equal(await waitFor(() => !alive(pid)), true, 'app outlived its supervisor');
  } finally {
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    desk.stop();
  }
});

test('an app that ignores SIGTERM is killed with its process group', async () => {
  const desk = await session('stubborn-app');
  let pid;
  try {
    const script = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
    ({ pid } = await startWatcher([process.execPath, '-e', script], desk.env, desk.log, undefined, false));
    assert.equal(alive(pid), true);
    await desk.stop();
    assert.equal(await waitFor(() => !alive(pid)), true, 'app survived the process-group kill');
  } finally {
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    desk.stop();
  }
});

test('screen-relay run hands the app to a holder that stops it with the session', async () => {
  const stateHome = join(directory, 'state');
  const path = join(stateHome, 'screen-relay', 'desk');
  mkdirSync(path, { recursive: true });
  const supervisor = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const pidFile = join(directory, 'app.pid');
  const previous = process.env.XDG_STATE_HOME;
  let pid;
  try {
    await new Promise((resolve, reject) => { supervisor.once('spawn', resolve); supervisor.once('error', reject); });
    writeFileSync(join(path, 'session.json'), JSON.stringify({
      name: 'desk', state: 'ready', backend: 'macos', ownsDisplay: false, environment: {},
      supervisor: identity(supervisor.pid),
    }));
    process.env.XDG_STATE_HOME = stateHome;
    const script = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)`;
    assert.equal(await cmdRun({ command: 'run', json: true, name: 'desk', app: process.execPath, args: ['-e', script] }), 0);
    pid = Number(readFileSync(pidFile, 'utf8'));
    assert.equal(alive(pid), true);
    await assert.rejects(cmdRun({ command: 'run', json: true, name: 'desk', app: process.execPath, args: ['-e', 'process.exit(3)'] }), { reason: 'component_failed', message: /exited with code 3/ });
    supervisor.kill('SIGKILL');
    await new Promise((resolve) => supervisor.once('exit', resolve));
    assert.equal(await waitFor(() => !alive(pid)), true, 'screen-relay run app outlived its session');
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previous;
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    if (supervisor.exitCode === null && supervisor.signalCode === null) supervisor.kill('SIGKILL');
  }
});

test('background work from a plain app survives the app until the session stops', async () => {
  const desk = await session('background-app');
  const ready = join(directory, 'background.ready');
  const stopped = join(directory, 'background.stopped');
  const trigger = join(directory, 'background.trigger');
  const childPid = join(directory, 'background.pid');
  let pid;
  try {
    const childScript = "const fs = require('node:fs'); fs.writeFileSync(process.argv[1], 'ready'); process.on('SIGTERM', () => { fs.writeFileSync(process.argv[2], 'stopped'); process.exit(0) }); setInterval(() => {}, 1000)";
    const appScript = "const fs = require('node:fs'); const child = require('node:child_process').spawn(process.execPath, ['-e', process.argv[1], process.argv[2], process.argv[3]], { stdio: 'ignore' }); fs.writeFileSync(process.argv[4], String(child.pid)); const timer = setInterval(() => { if (fs.existsSync(process.argv[5])) { clearInterval(timer); child.unref(); process.exit(0) } }, 20)";
    const started = await startWatcher([process.execPath, '-e', appScript, childScript, ready, stopped, childPid, trigger], desk.env, desk.log, undefined, false);
    pid = Number(readFileSync(childPid, 'utf8'));
    assert.equal(await waitFor(() => existsSync(ready)), true, 'the app did not start a child');
    const holder = parentOf(started.pid);
    writeFileSync(trigger, 'exit');
    assert.equal(await waitFor(() => !alive(started.pid)), true, 'the app did not exit');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(alive(pid), true, 'the child was stopped when the app exited');
    assert.equal(existsSync(stopped), false, 'the child was signalled when the app exited');
    assert.equal(alive(holder), true, 'the holder left before the session stopped');
    await desk.stop();
    assert.equal(await waitFor(() => existsSync(stopped)), true, 'the child outlived the session');
    assert.equal(await waitFor(() => !alive(holder)), true, 'the holder outlived the session');
  } finally {
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    await desk.stop();
  }
});

test('the holder exits once the app leaves nothing in its group', async () => {
  const desk = await session('empty-app');
  const trigger = join(directory, 'empty.trigger');
  let pid;
  try {
    const script = "const fs = require('node:fs'); const timer = setInterval(() => { if (fs.existsSync(process.argv[1])) { clearInterval(timer); process.exit(0) } }, 20)";
    const started = await startWatcher([process.execPath, '-e', script, trigger], desk.env, desk.log, undefined, false);
    pid = started.pid;
    const holder = parentOf(pid);
    writeFileSync(trigger, 'exit');
    assert.equal(await waitFor(() => !alive(pid)), true, 'the app did not exit');
    assert.equal(await waitFor(() => !alive(holder), 5000), true, 'the holder stayed after its group emptied');
  } finally {
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    await desk.stop();
  }
});

test('a plain app runs once and a restarted app runs again', async () => {
  const desk = await session('restart-app');
  const marker = join(directory, 'runs');
  const script = "require('node:fs').appendFileSync(process.argv[1], 'run\\n')";
  const runs = () => {
    try { return readFileSync(marker, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; }
  };
  try {
    const once = await startWatcher([process.execPath, '-e', script, marker], desk.env, desk.log, undefined, false);
    assert.equal(once.exited, 0);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(runs(), 1, 'a plain app was restarted');
    await startWatcher([process.execPath, '-e', script, marker], desk.env, desk.log, undefined, true);
    assert.equal(await waitFor(() => runs() >= 3), true, 'a restarted app did not run again');
  } finally {
    await desk.stop();
  }
});
