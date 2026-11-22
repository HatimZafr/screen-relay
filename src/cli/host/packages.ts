import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type DistroFamily = 'apt' | 'dnf' | 'pacman' | 'apk';
export type Family = DistroFamily | 'termux';

const families = new Map<string, DistroFamily>([
  ['debian', 'apt'],
  ['ubuntu', 'apt'],
  ['fedora', 'dnf'],
  ['arch', 'pacman'],
  ['alpine', 'apk'],
]);

const columns: Record<Family, number> = { apt: 2, dnf: 3, pacman: 4, apk: 5, termux: 6 };

const unsupported = ['rhel', 'rocky', 'almalinux', 'centos'];

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
let table: string[][] | undefined;

/** Rows of packages.tsv, read on first use from beside the installed CLI or from the root of a source checkout. */
export function rows(): string[][] {
  if (table) return table;
  const candidates = [join(runtimeDirectory, 'packages.tsv'), resolve(runtimeDirectory, '../../packages.tsv'), resolve(runtimeDirectory, '../../../packages.tsv')];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (path === undefined) throw new Error(`packages.tsv not found beside ${runtimeDirectory}`);
  table = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split('\t'));
  return table;
}

function osReleaseWords(osRelease: string, key: string): string[] {
  const line = osRelease.split('\n').find((row) => row.startsWith(`${key}=`));
  return line === undefined ? [] : line.slice(key.length + 1).replace(/^["']|["']$/g, '').split(' ').filter(Boolean);
}

/** Family from os-release text: ID first, then each ID_LIKE word. Returns undefined for an unsupported distro. */
export function detectFamily(osRelease: string): DistroFamily | undefined {
  for (const id of [...osReleaseWords(osRelease, 'ID'), ...osReleaseWords(osRelease, 'ID_LIKE')]) {
    if (unsupported.includes(id)) return undefined;
    const family = families.get(id);
    if (family !== undefined) return family;
  }
  return undefined;
}

/** Distro package names for the logical names, in table order, deduplicated. Throws on an unknown name. */
export function packagesFor(family: Family, names: string[]): string[] {
  const unknown = names.find((name) => !rows().some((row) => row[1] === name));
  if (unknown !== undefined) throw new Error(`unknown package name: ${unknown}`);
  const packages = new Set<string>();
  for (const row of rows().filter((entry) => names.includes(entry[1]))) {
    for (const cell of row[columns[family]].split(' ')) {
      if (cell !== '-') packages.add(cell);
    }
  }
  return [...packages];
}

/** Distro package names for every row in the given groups, in table order, deduplicated. */
export function groupPackages(family: Family, groups: string[], skip: string[] = []): string[] {
  const packages = new Set<string>();
  for (const row of rows().filter((entry) => groups.includes(entry[0]) && !skip.includes(entry[1]))) {
    for (const cell of row[columns[family]].split(' ')) {
      if (cell !== '-') packages.add(cell);
    }
  }
  return [...packages];
}

/** Whether packages.tsv has a row that provides this program or library. */
export function provides(name: string): boolean {
  return rows().some((row) => row[1] === name);
}

/** The non-interactive install command to paste, with prefix '' or 'sudo '. */
export function installCommand(family: Family, packages: string[], prefix: string): string {
  const list = packages.join(' ');
  switch (family) {
    case 'apt': return `${prefix}apt-get install -y --no-install-recommends ${list}`;
    case 'dnf': return `${prefix}dnf -y install --setopt=install_weak_deps=False ${list}`;
    case 'pacman': return `${prefix}pacman -Syu --needed --noconfirm ${list}`;
    case 'apk': return `${prefix}apk add --no-cache ${list}`;
    case 'termux': return `pkg install -y ${list}`;
  }
}
