import type { OutputOptions } from './mode.js';
import type { NextCommand } from '../protocol/errors.js';
import { theme } from './theme.js';

/** Splits a command line on whitespace while keeping single- and double-quoted runs together. */
export function tokens(command: string): string[] {
  const result: string[] = [];
  let token = '';
  let quote = '';
  for (const character of command) {
    if (quote) {
      if (character === quote) quote = '';
      else token += character;
    } else if (character === "'" || character === '"') quote = character;
    else if (/\s/.test(character)) {
      if (token) result.push(token);
      token = '';
    } else token += character;
  }
  if (token) result.push(token);
  return result;
}

export function nextCommand(command: string): NextCommand {
  return { command, argv: tokens(command) };
}

export function nextFor(command: string): NextCommand[] {
  return [nextCommand(command)];
}

export function quote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

export function row(label: string, value: unknown, args: OutputOptions = {}): string {
  const gutter = theme(args).plain ? '' : ' ';
  return `${gutter}${label.padEnd(16)}${String(value ?? '')}`;
}

export function receipt(label: string, value: unknown, args: OutputOptions = {}): string {
  const style = theme(args);
  return style.plain ? `${style.primary(label)} ${String(value ?? '')}` : `${style.success} ${style.primary(label.padEnd(16))}${String(value ?? '')}`;
}

export function nextStep(benefit: string, command: string, args: OutputOptions = {}): string {
  return `\n  ${benefit}:\n    ${theme(args).command(command)}`;
}

export function hintStep(instruction: string, hint: string): string {
  return `\n  ${instruction}:\n    ${hint}`;
}

export function sessionCommand(command: string, name: string): string {
  return `screen-relay ${command}${name === 'default' ? '' : ` --name ${quote(name)}`}`;
}

export function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

export function duration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return rounded < 60 ? `${rounded}s` : `${Math.floor(rounded / 60)}m${rounded % 60 ? ` ${rounded % 60}s` : ''}`;
}

export function size(bytes: number): string {
  return bytes < 1000 ? count(bytes, 'byte') : bytes < 1e6 ? `${(bytes / 1000).toFixed(1)} kB` : `${(bytes / 1e6).toFixed(1)} MB`;
}
