# System Invariant Engine (`skill-system-invariant-engine`)

Deterministic pre-commit and CI verification gate enforcing character invariants, file boundaries, brand boundaries, and Prettier code formatting across digital studio repositories.

Part of the **We Build for Good Open Source Skills Library**.

---

## Why This Exists

Autonomous AI coding agents can write thousands of lines of syntactically valid code in minutes. However, language models inevitably suffer from cognitive drift over extended multi-hour sessions:
- They forget subtle negative constraints (e.g. strict prohibition of specific punctuation).
- They introduce formatting inconsistencies that clutter git diffs.
- They generate monolithic 2,000-line "god files" that are impenetrable to human review.
- They accidentally re-introduce outdated staging domains or personal URLs into public-facing releases.

Relying on prompt memory to maintain code hygiene is a known failure mode. The **System Invariant Engine** replaces probabilistic prompt compliance with fast, deterministic Node.js verification gates that execute before code is ever committed or deployed.

---

## What It Checks

1. **Prettier Code Formatting (`rule-format-prettier`):** Ensures all files strictly match studio formatting standards (`printWidth: 100`, `singleQuote: false`, `trailingComma: "all"`).
2. **Zero Em Dashes (`rule-syntax-em-dash`):** Scans for forbidden em dashes (Unicode `\u2014`), requiring colons, commas, or parentheses instead.
3. **Modularity Boundary (`rule-file-boundary`):** Enforces a 400-line modularity threshold on source code files to ensure legibility for external engineering teams.
4. **Brand & Domain Sovereignty (`rule-brand-integrity`):** Validates that all public metadata references production routes rather than legacy development subdomains.

---

## Quick Start

### Installation
Clone into your tools directory or install as a dev dependency:

```bash
git clone https://github.com/We-Build-For-Good/skill-system-invariant-engine.git
```

### Running Checks
```bash
# Scan entire directory
node bin/invariant-check.mjs

# Automatically repair fixable violations (em dashes, formatting)
node bin/invariant-check.mjs --fix

# Scan only git staged files before commit
node bin/invariant-check.mjs --staged

# Strict mode: treat warnings as blocking errors
node bin/invariant-check.mjs --strict
```

### Git Hook Integration
Install into `.git/hooks/pre-commit`:
```bash
#!/usr/bin/env bash
node path/to/skill-system-invariant-engine/bin/invariant-check.mjs --staged
```

---

## License

MIT © [We Build for Good](https://webuildforgood.com)
