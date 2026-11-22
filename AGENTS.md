# screen-relay

screen-relay streams a Linux desktop to a browser and lets humans and AI agents control it from a CLI and a Node SDK. See [README.md](README.md) and the [documentation site](https://screen-relay.dev/docs) for how it works.

## Writing

Use the `technical-writer` skill (`.agents/skills/technical-writer/SKILL.md`) whenever you write or edit prose for this repo. That covers the pages in `docs/content/docs/`, the Geistdocs configuration in `docs/`, `README.md`, the agent skills that `screen-relay skills` serves from `skills/`, CLI help and error text, commit messages, PR descriptions, and issues.

## Diagrams

Use the `architecture-diagram` skill (`.agents/skills/architecture-diagram/SKILL.md`) to create or update diagrams in the docs.

## Releasing

A release is one PR, prepared by hand. The maintainer controls the changelog's voice and format.

To prepare a release:

1. Create a branch, such as `laf/prepare-v0.2.0`.
2. Bump `version` in `package.json`, then run `npm install --package-lock-only` to update `package-lock.json`.
3. Write the entry at the top of `CHANGELOG.md`, under a new `## <version>` heading, wrapped in `<!-- release:start -->` and `<!-- release:end -->` markers. Remove the markers from the previous entry so that only the new release has them.
4. Add a matching entry at the top of `docs/content/docs/changelog.mdx`, below the frontmatter.
5. Run `node scripts/check-version-sync.mjs`. CI runs the same check on every PR.
6. Open a PR and merge it to `main`.

When the PR merges, the Release workflow checks whether npm already has the version in `package.json`. If it doesn't, it publishes `screen-relay` to npm and creates the `v<version>` GitHub release. The release has no engine binaries: `screen-relay install` builds the engine on each machine. The release body is the text between the markers in `CHANGELOG.md`.

If npm already has the version but the GitHub release is missing, the workflow creates only the release. To retry a failed run, start the workflow from the Actions tab on `main`.

Publishing uses npm trusted publishing from the `Release` environment, so the workflow needs no npm token. The `Release` environment has required reviewers, so the publish job waits in the Actions run until one of them approves it.

### Writing the changelog

Review the git log since the last release tag and write the entry in `CHANGELOG.md`. Group changes under `### New Features`, `### Bug Fixes`, `### Improvements`, and `### Documentation`, and leave out a group that has no changes. Bold the name of the feature or fix, describe it in one sentence, and put the PR numbers in parentheses.

```markdown
## 0.2.1

<!-- release:start -->

### Bug Fixes

- Fixed **baz** failing when qux is enabled (#1235)

### Contributors

- @lahfir

<!-- release:end -->

## 0.2.0

### New Features

- Added the **foo command**, which does bar (#1234)
```

End the entry with a `### Contributors` section that lists the GitHub username, with an `@` prefix, of everyone who contributed to the release. Find them in the git log between the previous tag and `HEAD`.

Do not prefix entries with commit hashes.

### Docs changelog

`docs/content/docs/changelog.mdx` mirrors `CHANGELOG.md` with these differences:

- The version has a `v` prefix, such as `## v0.2.0`.
- A date line follows the heading: `<p className="text-[#888] text-sm">November 14, 2026</p>`.
- A `---` line separates entries.
- It has no release markers and no `### Contributors` section.

