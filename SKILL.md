---
name: system-invariant-engine
description: Pre-commit and CI gate that enforces the rules a repository writes in invariants.json (forbidden text with automatic fixes, file-size limits, Prettier). Use when setting up commit hooks or CI checks, or whenever a rule an AI agent keeps forgetting should become a mechanical check.
license: MIT
metadata:
  author: We Build for Good
  version: "2.0.0"
---

# System Invariant Engine: Deterministic Studio Compliance

Language models drift. Over a multi-hour session across multiple repositories, an AI coordinator can forget instructions, misinterpret rules, or allow prohibited syntax and formatting to slip through.

A prompt instructing an agent to check the rules still relies on probabilistic model memory. 
An **executable gate that mechanically rejects violations** is a fundamentally different class of capability.

The **System Invariant Engine** turns those rules into a pre-commit and CI check that runs before any work leaves the machine.

---

## The Prime Directive

**Never rely on agent memory for what can be proven by a deterministic compiler, linter, or regex.**

If a rule can be expressed as a character check, a line boundary, or a formatted diff, it belongs in an executable invariant test, not a paragraph of prompt instructions.

---

## How to use it

1. **Write the rule down as config, not as a prompt.** Copy [`invariants.json`](invariants.json) into the repository and edit it. Each rule has an `id`, a `type`, a `severity` (`error` or `warning`), and type-specific settings:
   * `forbidden-text`: a `pattern` (regular expression), optional `fixes` (`pattern` and `replace` pairs used by `--fix`), optional `extensions`, and `checkCommitMessages` (default true).
   * `file-boundary`: a `threshold` line count and optional `extensions`.
   * `prettier`: runs only when the repository configures Prettier.
   * Any rule can be switched off with `"enabled": false`.
2. **Install the hooks** so the check runs on every commit: `--staged` in `pre-commit`, `--message-file "$1"` in `commit-msg` (see README).
3. **Run it in CI** with `--strict` so warnings also fail.
4. **When the agent breaks a rule, add the rule here** rather than repeating the instruction in the prompt.

The default rules are: no em dashes (our house style), source files under 400 lines (warning), and Prettier where the repository configures it. They apply only when the repository has no `invariants.json` of its own.

## Honest limits

* `--fix` rewrites text wherever the pattern matches, including inside code. Review the diff.
* If a repository configures Prettier but Prettier is not installed, formatting is reported as not checked, never as passed.
* It checks text, not meaning: rules are regular expressions.

## CLI

```bash
node bin/invariant-check.mjs --staged                  # pre-commit
node bin/invariant-check.mjs --message-file "$1"       # commit-msg
node bin/invariant-check.mjs --dir . --fix             # apply configured fixes
node bin/invariant-check.mjs --dir . --strict --json   # CI
```
