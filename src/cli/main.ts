#!/usr/bin/env node
import { commands, type Args } from './commands.js';
import { formatHelp, helpDocument, version } from './help.js';
import { parseCommand, unknownToken } from './parser.js';
import { emit, Failure, printFailure, writeText } from './output.js';
import { RelayError } from '../protocol/index.js';

export { commands } from './commands.js';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let jsonMode = argv.slice(0, argv.indexOf('--') < 0 ? argv.length : argv.indexOf('--')).reduce((json, token) => token === '--json' ? true : token === '--no-json' ? false : json, false);
  let command = '';
  let args: Args | undefined;
  const controller = new AbortController();
  let signalExit = 0;
  const signals = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 } as const;
  const handlers = Object.entries(signals).map(([signal, number]) => {
    const handler = () => {
      if (controller.signal.aborted) process.exit(128 + number);
      signalExit = 128 + number;
      controller.abort();
    };
    return [signal, handler] as const;
  });
  try {
    args = parseCommand(argv);
    jsonMode = args.json;
    command = args.command;
    if (args.version) {
      emit(args, { version }, version);
      return 0;
    }
    if (!command || command === 'help' || args.help) {
      const topic = command === 'help' ? String(args.topic ?? (args.help ? 'help' : '')) : command;
      if (topic && !Object.hasOwn(commands, topic)) throw unknownToken('command', topic, Object.keys(commands));
      if (args.json) {
        const document = command === 'help' && args.all ? Object.keys(commands).map((name) => helpDocument(name)) : helpDocument(topic);
        emit(args, document, '');
      } else writeText(formatHelp(topic, args));
      return 0;
    }
    args.signal = controller.signal;
    for (const [signal, handler] of handlers) process.on(signal, handler);
    const result = await commands[command].run!(args);
    return signalExit || result || 0;
  } catch (error) {
    if (signalExit) return signalExit;
    if (error instanceof RelayError) {
      printFailure(error, jsonMode, args);
      return error.exitCode;
    }
    if (error instanceof Error && error.name === 'AbortError') return 130;
    printFailure(new Failure('internal', `Unexpected error in screen-relay${command ? ` ${command}` : ''}. This is a bug in screen-relay.`), jsonMode, args);
    return 1;
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  }
}

main().then((code) => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
