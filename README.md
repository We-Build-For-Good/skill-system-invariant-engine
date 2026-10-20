# System Invariant Engine (`skill-system-invariant-engine`)

A zero-dependency pre-commit and CI check that enforces the rules you write down in `invariants.json`: forbidden text (with optional automatic fixes), a file-size limit, and Prettier formatting.

Part of the **We Build for Good** open-source skills library.

---

## Why this exists

AI coding agents forget negative rules over long sessions ("never use X", "never link to the old domain"). A rule written in a prompt relies on the model remembering it. A rule written in a config file and checked before every commit does not.

## What it checks

Rules live in a JSON file. The engine uses, in order: `--config <file>`, then `invariants.json` or `.invariants.json` in the repo being checked, then its own [default `invariants.json`](invariants.json).

| Rule type | What it does | Default |
|---|---|---|
| `forbidden-text` | Fails when a regular expression matches. Optional `fixes` are applied by `--fix`. Optional `extensions` limits which files it applies to. | One rule: no em dashes (our house style; turn it off with `"enabled": false`) |
| `file-boundary` | Warns when a source file is longer than `threshold` lines | 400 lines, warning only |
| `prettier` | Runs `prettier --check`, but only in repos that configure Prettier. If the repo configures Prettier and it is not installed, that is reported as a warning, never as a pass. | On |

See [`examples/brand-domains.invariants.json`](examples/brand-domains.invariants.json) for a config that also replaces a retired staging domain with the live one.

What it scans: in a git repository, every tracked and untracked file that `.gitignore` does not exclude (so build output is skipped). Outside git, everything except common build and dependency folders. Binary files and lockfiles are skipped.

---

## Usage

```bash
node bin/invariant-check.mjs                         # check the current directory
node bin/invariant-check.mjs --dir path/to/repo      # check another directory
node bin/invariant-check.mjs --fix                   # apply the configured fixes
node bin/invariant-check.mjs --staged                # check what is staged (pre-commit)
node bin/invariant-check.mjs --message-file .git/COMMIT_EDITMSG   # check a commit message
node bin/invariant-check.mjs --strict --json         # CI: warnings fail, JSON output
```

Exit codes: `0` passed, `1` violations found, `2` bad options or an unreadable config.

`--staged` reads the staged version of each file (what will actually be committed), not the working copy. `--fix` cannot be combined with `--staged`, because it would change files without restaging them. Review `--fix` changes before committing: replacing text inside code changes what the code outputs.

### Git hooks

`.git/hooks/pre-commit`:
```bash
#!/usr/bin/env bash
node path/to/skill-system-invariant-engine/bin/invariant-check.mjs --staged
```

`.git/hooks/commit-msg`:
```bash
#!/usr/bin/env bash
node path/to/skill-system-invariant-engine/bin/invariant-check.mjs --message-file "$1"
```

### GitHub Actions
```yaml
- name: Check invariants
  run: node path/to/skill-system-invariant-engine/bin/invariant-check.mjs --strict
```

---

## Tests

```bash
npm test
```

## License

MIT. [We Build for Good](https://webuildforgood.com)
