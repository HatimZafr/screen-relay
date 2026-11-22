#!/usr/bin/env node
/** Fails when package-lock.json, CHANGELOG.md, or the docs changelog disagree with the version in package.json. */
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { version } = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const errors = [];

if (lock.version !== version || lock.packages[''].version !== version) {
  errors.push(`package-lock.json is at ${lock.version}; run \`npm install --package-lock-only\`.`);
}

const sections = read('CHANGELOG.md').split(/^## /m).slice(1);
if (!sections[0]?.startsWith(`${version}\n`)) {
  errors.push(`CHANGELOG.md must start with a \`## ${version}\` entry.`);
} else if (!sections[0].includes('<!-- release:start -->') || !sections[0].includes('<!-- release:end -->')) {
  errors.push(`The ${version} entry in CHANGELOG.md needs the release:start and release:end markers.`);
}
if (sections.slice(1).some((section) => section.includes('<!-- release:'))) {
  errors.push('Only the newest entry in CHANGELOG.md may have release markers.');
}

if (!read('docs/content/docs/changelog.mdx').split(/^## /m)[1]?.startsWith(`v${version}\n`)) {
  errors.push(`docs/content/docs/changelog.mdx must start with a \`## v${version}\` entry.`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Version ${version} is in sync.`);
