import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

const root = fileURLToPath(new URL('../..', import.meta.url));
mkdirSync(join(root, 'build'), { recursive: true });
const directory = mkdtempSync(join(root, 'build', 'packages-test-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const bundle = buildSync({
  entryPoints: [join(root, 'src/cli/host/packages.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const bundlePath = join(directory, 'packages.mjs');
writeFileSync(bundlePath, bundle.outputFiles[0].contents);
const { detectFamily, groupPackages, installCommand, packagesFor, rows } = await import(pathToFileURL(bundlePath).href);

test('detectFamily maps os-release ID and ID_LIKE to a package family', () => {
  const cases = [
    ['debian13', 'ID=debian\n', 'apt'],
    ['ubuntu2604', 'ID=ubuntu\nID_LIKE=debian\n', 'apt'],
    ['fedora44', 'ID=fedora\n', 'dnf'],
    ['alpine324', 'ID=alpine\n', 'apk'],
    ['omarchy', 'ID=omarchy\nID_LIKE=arch\n', 'pacman'],
    ['rocky10', 'ID=rocky\nID_LIKE="rhel centos fedora"\n', undefined],
    ['gentoo', 'ID=gentoo\n', undefined],
  ];
  for (const [name, osRelease, family] of cases) {
    assert.equal(detectFamily(osRelease), family, name);
  }
});

test('packagesFor maps logical names to distro packages, skipping unavailable cells', () => {
  assert.deepEqual(packagesFor('apt', ['xprop', 'xwininfo']), ['x11-utils']);
  assert.deepEqual(packagesFor('pacman', ['wayland-dev']), ['wayland', 'wayland-protocols']);
  assert.deepEqual(packagesFor('apt', ['linux-headers']), []);
  assert.throws(() => packagesFor('apt', ['no-such-package']), /unknown package name: no-such-package/);
});

test('Termux selects native X11 packages and installs them without elevation', () => {
  assert.deepEqual(packagesFor('termux', ['compiler', 'x264-dev', 'Xvfb', 'xauth']), ['clang', 'make', 'libx264', 'xorg-server-xvfb', 'xorg-xauth']);
  const packages = groupPackages('termux', ['core', 'x11', 'xfce']);
  assert.ok(packages.includes('xfce4-terminal'));
  assert.ok(!packages.includes('sway'));
  assert.equal(installCommand('termux', ['libx264'], ''), 'pkg install -y libx264');
});

test('every packages.tsv row has seven non-empty fields and no repeated logical name', () => {
  for (const row of rows()) {
    assert.equal(row.length, 7, row.join(' | '));
    assert.ok(row.every((field) => field !== ''), row.join(' | '));
  }
  const logical = rows().map((row) => row[1]);
  assert.equal(new Set(logical).size, logical.length);
});
