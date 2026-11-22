import { outputMode, type OutputOptions } from './mode.js';
import { nextCommand, nextStep, hintStep, receipt, row, sessionCommand, tokens } from './format.js';
import { theme } from './theme.js';
import { ERROR_REASONS, RelayError, type ErrorOptions, type ErrorReason, type NextCommand } from '../protocol/errors.js';

export { count, duration, hintStep, nextCommand, nextFor, nextStep, quote, receipt, row, sessionCommand, size } from './format.js';

export class Failure extends RelayError {
  constructor(code: string, message: string, hint = '', extra: Record<string, unknown> = {}, options: ErrorOptions = {}) {
    const errorClass = ERROR_REASONS[code as ErrorReason]?.class;
    super(code, message, {
      status: errorClass === 'usage' || errorClass === 'missing_input' ? 'action_required' : 'error',
      ...options, hint, data: extra,
    });
    this.name = 'Failure';
  }

  payload(): Record<string, unknown> {
    return { reason: this.reason, message: this.message, ...(this.hint ? { hint: this.hint } : {}), ...this.data };
  }
}

export function emit(args: OutputOptions, data: unknown, text: string, mutation?: { identifier?: string }): void {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(data, null, outputMode(args).pretty ? 2 : undefined)}\n`);
    return;
  }
  const stream = mutation ? process.stderr : process.stdout;
  if (text) stream.write(`${text}\n`);
  if (mutation?.identifier !== undefined && !outputMode(args, process.stdout).tty) process.stdout.write(`${mutation.identifier}\n`);
}

export function writeText(text: string): void {
  process.stdout.write(text);
}

export function printWarning(text: string, args: OutputOptions = {}): void {
  if (!args.json) process.stderr.write(`${theme(args).warning} ${text}\n`);
}

export function printNext(args: OutputOptions, benefit: string, command: string): void {
  if (!args.json) process.stderr.write(`${nextStep(benefit, command, args)}\n`);
}

export function formatReady(info: Record<string, any>, args: Record<string, any>, background = false): string {
  const lines = [receipt('Started', info.name, args), row('Viewer', info.viewer, args)];
  if (info.display) lines.push(row('Display', info.display, args));
  if (info.waylandDisplay) lines.push(row('Wayland display', info.waylandDisplay, args));
  if (info.resolution) lines.push(row('Resolution', `${info.resolution}${info.fps ? ` at ${info.fps} fps` : ''}`, args));
  lines.push(row('Logs', info.logs, args));
  const loopback = info.bind === '127.0.0.1';
  if (info.public) {
    if (!args['tls-cert']) {
      const host = loopback ? info.bind : '<HOST>';
      lines.push(row('TLS proxy', `Forward ${info.url} to http://${host}:${info.port}`, args));
    } else if (loopback) {
      lines.push(row('Listening', `${info.bind}:${info.port}; pass --bind <ADDR> to accept remote clients`, args));
    }
  } else if (!loopback) {
    lines.push(row('Listening', `${info.bind}:${info.port}; use a loopback port publish or SSH tunnel`, args));
  }
  lines.push(nextStep(background ? 'Stop it' : 'Stop it (or press Ctrl-C)', sessionCommand('down', String(info.name)), args));
  return lines.join('\n');
}

export function formatStatus(name: string, session: Record<string, any>, args: OutputOptions = {}): string {
  const lines = [row('Session', name, args), row('State', session.state, args)];
  const labels: Record<string, string> = { url: 'URL', display: 'Display', waylandDisplay: 'Wayland display', resolution: 'Resolution', fps: 'FPS', logs: 'Logs', token: 'Token' };
  for (const key of ['url', 'display', 'waylandDisplay', 'resolution', 'fps', 'logs', 'token']) {
    if (session[key] !== undefined) lines.push(row(labels[key], session[key], args));
  }
  if (session.error) lines.push(row('Error', session.error.message, args));
  if (session.health) lines.push(row('Health', session.health.message, args));
  return lines.join('\n');
}

export function formatStopped(name: string, stopped: boolean, args: OutputOptions = {}): string {
  return receipt(stopped ? 'Stopped' : 'Unchanged', name, args);
}

export function formatStarted(command: string, pid: number, display: string, log: string, args: OutputOptions = {}): string {
  return [receipt('Started', command, args), row('PID', pid, args), row('Display', display, args), row('Logs', log, args)].join('\n');
}

export function formatDoctor(checks: Array<{ status: string; name: string; detail: string; fix: string }>, args: OutputOptions = {}): string {
  const lines: string[] = [];
  for (const item of checks) {
    lines.push(row('Check', `${item.name}: ${item.status}; ${item.detail}`, args));
    if (item.fix) lines.push(row('Fix', item.fix, args));
  }
  return lines.join('\n');
}

function nextFromHint(hint?: string): NextCommand[] | undefined {
  if (!hint) return undefined;
  for (const match of hint.matchAll(/`([^`]+)`/g)) {
    const command = match[1].trim();
    if (/^screen-relay( |$)/.test(command)) return [nextCommand(command)];
  }
  return undefined;
}

function recoveryLabel(command: string): string {
  const argv = tokens(command);
  if (argv[1] === 'help') return argv[2] ? `See ${argv[2]} options` : 'See all commands';
  if (argv.includes('--help') && argv[1]) return `See ${argv[1]} options`;
  if (argv[1] === 'up') return 'Start a session';
  if (argv[1] === 'down') return 'Stop the session';
  if (argv[1] === 'status') return argv.includes('--url') ? 'Check the remote session' : 'Check the session';
  if (argv[1] === 'logs') return 'Read the logs';
  if (argv[1] === 'doctor') return 'Check the machine';
  if (argv[1] === 'install') return 'Set up this machine';
  if (argv[1] === 'screenshot') return 'Take a screenshot';
  if (argv[1] === 'skills') return argv[2] === 'get' ? 'Read the skill' : 'List the skills';
  return 'Run this next';
}

export function printFailure(failure: RelayError, jsonMode: boolean, args: OutputOptions = {}): void {
  const data = failure.data ?? {};
  const next = failure.next ?? nextFromHint(failure.hint);
  if (jsonMode) {
    process.stderr.write(`${JSON.stringify({
      status: failure.status, reason: failure.reason, message: failure.message,
      ...(next ? { next } : {}), ...(Object.keys(data).length ? { data } : {}),
    })}\n`);
    return;
  }
  const lines = [`${theme(args).error} ${failure.message.replace(/[\r\n]+/g, ' ')}`];
  for (const key of ['component', 'logs', 'applied']) {
    if (data[key] !== undefined) lines.push(row(key[0].toUpperCase() + key.slice(1), data[key], args));
  }
  const recovery = next?.[0];
  if (recovery) lines.push(nextStep(failure.label ?? recoveryLabel(recovery.command), recovery.command, args));
  else if (failure.hint) lines.push(hintStep(failure.label ?? 'Next step', failure.hint.replace(/[\r\n]+/g, ' ')));
  process.stderr.write(`${lines.slice(0, 8).join('\n')}\n`);
}
