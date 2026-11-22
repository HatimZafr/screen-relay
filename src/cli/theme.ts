import { outputMode, type OutputOptions } from './mode.js';

export function theme(args: OutputOptions = {}, stream: NodeJS.WriteStream = process.stderr) {
  const mode = outputMode(args, stream);
  const paint = (value: string, open: number, close = 0) => mode.color ? `\u001b[${open}m${value}\u001b[${close}m` : value;
  return {
    plain: mode.plain,
    success: mode.plain ? '' : paint('✓', 32),
    warning: mode.plain ? 'Warning:' : paint('!', 33),
    error: mode.plain ? 'Error:' : paint('✗', 31),
    primary: (value: string) => paint(value, 1),
    strong: (value: string) => paint(value, 1, 22),
    dim: (value: string) => paint(value, 2, 22),
    italic: (value: string) => paint(value, 3, 23),
    muted: (value: string) => paint(value, 90, 39),
    command: (value: string) => paint(value, 36),
    accent: (value: string) => paint(value, 36, 39),
  };
}
