import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SANDBOX, SANDBOX_SCOPE } from "./config.ts";

const run = promisify(execFile);

/** Runs one automation command inside the sandbox that hosts the desktop. */
export async function runInSandbox(binary: string, args: string[]) {
  if (!SANDBOX) throw new Error("Set SCREEN_RELAY_SANDBOX to the sandbox name that runs screen-relay");
  const scope = SANDBOX_SCOPE ? ["--scope", SANDBOX_SCOPE] : [];
  try {
    const { stdout, stderr } = await run(
      "sandbox",
      ["exec", SANDBOX, ...scope, "--", "/vercel/.local/bin/relay-env", binary, ...args],
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return { content: [{ type: "text" as const, text: JSON.stringify({ stdout, stderr: stripEcho(stderr) }) }] };
  } catch (error: any) {
    const detail = {
      exitCode: typeof error.code === "number" ? error.code : null,
      signal: error.signal ?? null,
      stdout: error.stdout ?? "",
      stderr: stripEcho(error.stderr || error.message || "Command failed"),
    };
    return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(detail) }] };
  }
}

/** Drops the command line the sandbox CLI echoes onto stderr. */
function stripEcho(stderr: string): string {
  return stderr.replace(/^\$ sh -lc .*\n/, "").trim();
}
