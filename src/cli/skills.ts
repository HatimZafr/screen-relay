import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { emit, Failure, nextFor } from './output.js';

type Skill = { name: string; description: string; hidden: boolean; directory: string };
const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const skillsDirectory = [join(runtimeDirectory, 'skills'), resolve(runtimeDirectory, '../../skills')].find((path) => {
  try { return statSync(path).isDirectory(); } catch { return false; }
}) ?? join(runtimeDirectory, 'skills');

function discover(): Skill[] {
  let entries: string[];
  try { entries = readdirSync(skillsDirectory); } catch { return []; }
  return entries.flatMap((entry) => {
    const location = join(skillsDirectory, entry);
    const file = join(location, 'SKILL.md');
    try {
      if (!statSync(location).isDirectory()) return [];
      const content = readFileSync(file, 'utf8');
      const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      if (!frontmatter) return [];
      const metadata = parse(frontmatter) as Record<string, unknown>;
      if (typeof metadata.name !== 'string') return [];
      return [{ name: metadata.name, description: typeof metadata.description === 'string' ? metadata.description : '', hidden: metadata.hidden === true, directory: location }];
    } catch { return []; }
  }).sort((left, right) => left.name.localeCompare(right.name));
}

/** Lists visible skills with their names and descriptions. */
export function list(): { name: string; description: string }[] {
  return discover().filter((skill) => !skill.hidden).map(({ name, description }) => ({ name, description }));
}

function missing(name: string): Failure {
  return new Failure('not_found', `Skill not found: ${name}`, 'List the skills with `screen-relay skills list`.');
}

/** Returns a skill's Markdown, optionally appending all reference and template files. */
export function get(name: string, options: { full?: boolean } = {}): { name: string; content: string } {
  const skill = discover().find((candidate) => candidate.name === name);
  if (!skill) throw missing(name);
  let content = readFileSync(join(skill.directory, 'SKILL.md'), 'utf8');
  if (options.full) {
    for (const subdirectory of ['references', 'templates']) {
      const directory = join(skill.directory, subdirectory);
      let entries: string[];
      try { entries = readdirSync(directory).sort(); } catch { continue; }
      for (const entry of entries) {
        const path = join(directory, entry);
        if (!statSync(path).isFile()) continue;
        content += `\n\n## ${subdirectory}/${entry}\n\n${readFileSync(path, 'utf8').trimEnd()}\n`;
      }
    }
  }
  return { name: skill.name, content };
}

/** Returns the skills directory, or a named skill's directory. */
export function path(name?: string): string {
  if (!name) return skillsDirectory;
  const skill = discover().find((candidate) => candidate.name === name);
  if (!skill) throw missing(name);
  return skill.directory;
}

/** Explains an unknown action; a skill name points at its get command instead. */
export function unknownAction(action: string): Failure {
  if (!list().some((skill) => skill.name === action)) return new Failure('invalid_input', `Unknown command '${action}' for screen-relay skills.`, 'Run `screen-relay help skills`.');
  return new Failure('invalid_input', `Unknown command '${action}' for screen-relay skills. Did you mean \`screen-relay skills get ${action}\`?`, '', {}, { next: nextFor(`screen-relay skills get ${action}`), label: `Show the ${action} skill` });
}

/** Runs skills list, get and path, printing text or the noun-shaped JSON document. */
export async function cmdSkills(args: Record<string, unknown> & { json: boolean }): Promise<number> {
  const action = String(args.action ?? 'list');
  if (action === 'list') {
    const skills = list();
    emit(args, { skills }, skills.map(({ name, description }) => `${name.padEnd(18)}${description}`).join('\n') || 'No skills found.');
    return 0;
  }
  if (action === 'get') {
    const skill = get(String(args.skill), { full: Boolean(args.full) });
    emit(args, { skill }, skill.content.trimEnd());
    return 0;
  }
  const directory = path(args.skill === undefined ? undefined : String(args.skill));
  emit(args, { path: directory }, directory);
  return 0;
}
