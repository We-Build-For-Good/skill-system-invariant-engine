---
name: system-invariant-engine
description: Deterministic pre-commit and CI verification gate. Enforces character-level invariants (zero em dashes), modular file boundaries, brand boundaries, and Prettier code legibility. Use before committing code, running PR checks, or releasing production artifacts.
license: MIT
metadata:
  author: We Build for Good
  version: "1.0.0"
---

# System Invariant Engine: Deterministic Studio Compliance

Language models drift. Over a multi-hour session across multiple repositories, an AI coordinator can forget instructions, misinterpret rules, or allow prohibited syntax and formatting to slip through.

A prompt instructing an agent to check the rules still relies on probabilistic model memory. 
An **executable gate that mechanically rejects violations** is a fundamentally different class of capability.

The **System Invariant Engine** establishes deterministic pre-commit and continuous integration gates that enforce studio invariants, code legibility, and architectural modularity before any work leaves the machine.

---

## The Prime Directive

**Never rely on agent memory for what can be proven by a deterministic compiler, linter, or regex.**

If a rule can be expressed as a character check, a line boundary, or a formatted diff, it belongs in an executable invariant test, not a paragraph of prompt instructions.

---

## Core Invariant Rules

### Rule 1: Code Legibility & Universal Prettier (`rule-format-prettier`)
* **Standard:** Every repository enforces standard Prettier formatting.
* **Standard Configuration:**
  ```json
  {
    "printWidth": 100,
    "tabWidth": 2,
    "semi": true,
    "singleQuote": false,
    "trailingComma": "all"
  }
  ```
* **Verification:** Pull request diffs contain zero whitespace noise or arbitrary line-wrapping changes. Every diff reflects pure logical intent.

### Rule 2: Syntax Invariant: Strict Zero Em Dashes (`rule-syntax-em-dash`)
* **Standard:** The em dash character (Unicode `\u2014`) is strictly prohibited across all code, commits, comments, and public marketing copy.
* **Allowed Replacements:** Use colons, commas, or parentheses.
* **Automatic Repair:** The engine automatically replaces em dashes with colons or commas when run with `--fix`.

### Rule 3: Architectural Modularity & File Size Gate (`rule-file-boundary`)
* **Standard:** Single source code files should not exceed 400 lines without an explicit architectural exemption.
* **Rationale:** Monolithic files of 1,500+ lines are unmaintainable for human engineers and prone to silent AI regression. Code must be cleanly decomposed into pure domain logic, I/O adapters, and presentation components.

### Rule 4: Brand & Domain Sovereignty (`rule-brand-integrity`)
* **Standard:** Public-facing HTML, XML sitemaps, and documentation must reference canonical production endpoints (e.g. `webuildforgood.com/frcem100/`) and strictly exclude obsolete development subdomains or staging handles.

---

## CLI Usage

### Check Staged Files (Pre-Commit Hook)
```bash
node bin/invariant-check.mjs --staged
```

### Full Repository Scan
```bash
node bin/invariant-check.mjs --dir .
```

### Automatic Repair Mode
```bash
node bin/invariant-check.mjs --dir . --fix
```

### Strict Mode (Warnings Treated as Errors)
```bash
node bin/invariant-check.mjs --dir . --strict
```

### Machine-Readable JSON Output
```bash
node bin/invariant-check.mjs --dir . --json
```

---

## Integration Runbook

### 1. Setting up Git Pre-Commit Hook
In any repository:
```bash
cat << 'EOF' > .git/hooks/pre-commit
#!/usr/bin/env bash
node path/to/wb4g-skills/skill-system-invariant-engine/bin/invariant-check.mjs --staged
EOF
chmod +x .git/hooks/pre-commit
```

### 2. CI Verification (GitHub Actions)
Add to `.github/workflows/ci.yml`:
```yaml
- name: Verify Studio Invariants
  run: node path/to/wb4g-skills/skill-system-invariant-engine/bin/invariant-check.mjs --strict
```
