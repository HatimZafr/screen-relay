# screen-relay repository standards

Read this file for every writing task in the screen-relay repository. It adapts the general guidance in this skill to screen-relay's readers, terms, and sources. When it conflicts with a general rule, this file wins.

## Know who reads what

The docs site in `docs/content/docs/` is for humans and AI agents who use screen-relay. Its human readers include:

- Operators who start a desktop on a Linux VM, sandbox, or container and open it in a browser.
- Agent builders who control that desktop from the `screen-relay` CLI, the Node SDK, or the HTTP and WebSocket API.

Neither group reads screen-relay's source. Write every page so a reader can act without opening the repository.

Contributor material lives outside the site. Source layout, threads, class and function names, build internals, and how to add a backend go in `CONTRIBUTING.md` at the repository root. The `README.md` is the front door: what screen-relay is, install, a quick start, how it works, agent setup, the command groups, platforms, development, and links to the docs site.

## Describe behavior, not implementation

On the docs site:

- Do not name source files, directories, classes, functions, or internal modules. Write `screen-relay up starts a virtual display, the desktop, and the engine`, not `supervisor.ts spawns Xvfb`.
- Name only what a reader can see or type: commands, flags, config keys, environment variables, endpoints, JSON fields, error reasons, file paths the reader creates or reads (such as `~/.config/screen-relay/config.yaml`), and the names of system packages they install.
- Explain a mechanism when it changes what the reader sees or decides. Flow control matters because the stream lowers its bitrate on a slow link; the class that implements it does not.
- Keep numbers that affect the reader (limits, defaults, timeouts, ports) and drop numbers that only describe the implementation.

## Use screen-relay's terms consistently

| Term | Meaning |
| --- | --- |
| VM | The Linux machine that shows the desktop and runs `screen-relay up`. Use "VM" even when it is a container or sandbox, and say so once on a page where it matters. |
| session | One running desktop started by `screen-relay up`, named with `--name` (default `default`). |
| engine | The screen-relay process on the VM that captures, encodes, streams, and accepts input. |
| viewer | The browser page that shows the desktop. |
| agent | A program that controls the desktop through the CLI, SDK, or API. |
| VM commands | `install`, `up`, `down`, `logs`, `run`, `doctor`. They run on the VM. |
| client commands | `status`, `screenshot`, `click`, `move`, `scroll`, `key`, `type`, `input`. They run on the VM, or anywhere with `--url` and a token. |
| token | The session secret that authorizes remote access. |

Say "one input owner at a time" when describing the viewer, `/control`, and `/input`: only one of them can send input at once.

## Ground every claim in the current code

Verify commands, flags, defaults, output, JSON shapes, error reasons, and endpoints against the code and against the real CLI (`screen-relay --help`, `screen-relay help <command>`, `screen-relay <command> --help --json`). Copy command output from a real run when you show it. Never document a flag, field, or behavior you have not confirmed.

## Keep pages simple and complete

- Lead each page with what the reader can do after reading it.
- Prefer one clear path through a task, then the variations.
- Use tables for reference material that shares fields (flags, config keys, endpoints, error reasons).
- Use the `<Diagram>` component and the `architecture-diagram` skill for diagrams, and keep a short text version next to each one.
- Link between pages instead of repeating a long explanation.

## Follow the repository's other rules

- Never name any other remote-desktop or streaming product in docs, code, commits, or PRs.
- Commit messages and PR descriptions: plain, short, say what changed and why. No AI tool, model, or agent attribution.
- Do not write code comments. Docstrings are the only exception, kept to one or two sentences.
