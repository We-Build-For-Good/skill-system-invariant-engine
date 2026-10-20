# Changelog

## 2.0.0 (2026-10-20)

Fixes from an independent review.

- **Rules now come from `invariants.json`.** In 1.0.0 the file was shipped but never read; every rule was hard-coded, including two of our own retired domains, which were applied to everyone's repository. The repo being checked can now supply its own rules, and any rule can be turned off.
- **`--staged` checks what is actually staged.** 1.0.0 read the working copy, so a fixed-but-unstaged file let the bad staged version through. It also quietly fell back to scanning the whole directory when git failed.
- **`.gitignore` is respected**, so build output such as `.next/` is no longer scanned.
- **Prettier gaps are reported.** 1.0.0 reported "verified clean" when Prettier was configured but not installed.
- **Commit messages can be checked** with `--message-file` (the docs already claimed commits were covered).
- Unknown options and bad configs exit with code 2. Prettier is called without a shell.
