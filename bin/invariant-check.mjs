#!/usr/bin/env node

/**
 * We Build for Good: System Invariant Engine (CLI)
 * Pre-commit and CI gate. Rules are read from invariants.json (see README).
 */

import fs from "node:fs";
import path from "node:path";
import { ConfigError, loadConfig, resolveConfigPath, runChecks } from "../lib/engine.mjs";

const HELP = `
We Build for Good: System Invariant Engine

Usage: wb4g-invariants [options]

  --dir <path>           Directory to check (default: current directory)
  --config <file>        Rules file (default: <dir>/invariants.json, then the engine's built-in defaults)
  --staged               Check the staged content of staged files (pre-commit hook)
  --message-file <file>  Check a commit message file against the text rules (commit-msg hook)
  --fix                  Apply each rule's automatic fixes (not with --staged)
  --strict               Treat warnings as errors
  --max-lines <n>        Override the file-boundary threshold
  --json                 Print results as JSON
  --help, -h             Show this help

Exit codes: 0 passed, 1 violations found, 2 bad options or config.
`;

function parseArgs(args) {
  const options = { dir: process.cwd(), config: "", staged: false, fix: false, strict: false, json: false, maxLines: null, messageFile: "", help: false, errors: [] };
  const valueFlags = { "--dir": "dir", "--config": "config", "--max-lines": "maxLines", "--message-file": "messageFile" };
  const boolFlags = { "--staged": "staged", "--fix": "fix", "--strict": "strict", "--json": "json", "--help": "help", "-h": "help" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (boolFlags[arg]) options[boolFlags[arg]] = true;
    else if (valueFlags[arg]) {
      if (i + 1 >= args.length || args[i + 1].startsWith("--")) options.errors.push(`${arg} needs a value.`);
      else options[valueFlags[arg]] = args[++i];
    } else options.errors.push(`Unknown option: ${arg}`);
  }
  options.dir = path.resolve(options.dir);
  if (options.maxLines !== null) {
    const n = Number.parseInt(options.maxLines, 10);
    if (!Number.isInteger(n) || n <= 0) options.errors.push("--max-lines must be a positive whole number.");
    options.maxLines = n;
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  if (options.errors.length) {
    options.errors.forEach((e) => console.error(`Error: ${e}`));
    return 2;
  }
  if (!fs.existsSync(options.dir)) {
    console.error(`Error: directory not found: ${options.dir}`);
    return 2;
  }

  let config;
  let result;
  try {
    config = loadConfig(resolveConfigPath(options.dir, options.config));
    if (options.maxLines) {
      config.rules.filter((r) => r.type === "file-boundary").forEach((r) => { r.threshold = options.maxLines; });
    }
    result = runChecks({
      targetDir: options.dir,
      config,
      staged: options.staged,
      fix: options.fix,
      strict: options.strict,
      messageFile: options.messageFile ? path.resolve(options.messageFile) : null
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Error: ${err.message}`);
      return 2;
    }
    throw err;
  }

  const errors = result.violations.filter((v) => v.severity === "error");
  const warnings = result.violations.filter((v) => v.severity === "warning");
  const notChecked = result.violations.filter((v) => v.notChecked);

  if (options.json) {
    console.log(JSON.stringify({
      targetDir: options.dir,
      configPath: config.path,
      rules: config.rules.map((r) => r.id),
      inspectedFilesCount: result.inspectedFilesCount,
      errorCount: errors.length,
      warningCount: warnings.length,
      notCheckedCount: notChecked.length,
      violations: result.violations
    }, null, 2));
    return errors.length > 0 ? 1 : 0;
  }

  console.log("===========================================================");
  console.log(" We Build for Good: System Invariant Engine");
  console.log(` Target directory : ${options.dir}`);
  console.log(` Rules            : ${config.path}`);
  console.log(` Files inspected  : ${result.inspectedFilesCount}`);
  console.log(` Errors           : ${errors.length}`);
  console.log(` Warnings         : ${warnings.length}`);
  console.log("===========================================================");

  for (const v of result.violations) {
    const rel = path.relative(options.dir, v.file) || path.basename(v.file);
    const tag = v.severity === "error" ? "ERROR" : v.severity === "info" ? "FIXED" : "WARN ";
    console.log(`[${tag}] [${v.rule}] ${rel}:${v.line}:${v.column}`);
    console.log(`        ${v.message}`);
  }

  if (errors.length > 0) {
    console.log("\nInvariant check failed. Resolve the errors above.\n");
    return 1;
  }
  console.log(notChecked.length ? "\nPassed, but some rules were NOT checked (see warnings).\n" : warnings.length ? "\nPassed with warnings.\n" : "\nAll invariants passed.\n");
  return 0;
}

process.exitCode = main();
