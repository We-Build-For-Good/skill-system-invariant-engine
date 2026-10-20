/**
 * We Build for Good: System Invariant Engine (core)
 *
 * Rules come from a JSON config (see invariants.json), not from code, so each
 * repository decides which invariants it enforces.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../invariants.json");
export const CONFIG_FILENAMES = ["invariants.json", ".invariants.json"];

const WALK_IGNORE = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage", ".output", ".vinxi", ".vercel",
  ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache", ".parcel-cache", ".temp", ".venv",
  "__pycache__", "target", "release-packets"
]);
const LOCKFILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"]);
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".pdf", ".mp4", ".mov", ".webm",
  ".mp3", ".wav", ".zip", ".tar", ".gz", ".tgz", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".wasm"
]);
const DEFAULT_SOURCE_EXTENSIONS = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".css", ".scss", ".html", ".vue", ".svelte"];

// Older configs identified rules by id only.
const LEGACY_TYPES = {
  "rule-syntax-em-dash": "forbidden-text",
  "rule-file-boundary": "file-boundary",
  "rule-format-prettier": "prettier",
  "rule-brand-integrity": "forbidden-text"
};

export class ConfigError extends Error {}

/** Finds the config: explicit path, then the target repo, then the engine's default. */
export function resolveConfigPath(targetDir, explicitPath) {
  if (explicitPath) {
    const p = path.resolve(explicitPath);
    if (!fs.existsSync(p)) throw new ConfigError(`Config file not found: ${p}`);
    return p;
  }
  for (const name of CONFIG_FILENAMES) {
    const p = path.join(targetDir, name);
    if (fs.existsSync(p)) return p;
  }
  return DEFAULT_CONFIG_PATH;
}

export function loadConfig(configPath) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new ConfigError(`Could not read config ${configPath}: ${err.message}`);
  }
  if (!Array.isArray(raw.rules)) throw new ConfigError(`Config ${configPath} has no "rules" array.`);

  const rules = raw.rules
    .filter((r) => r.enabled !== false)
    .map((r) => {
      const type = r.type || LEGACY_TYPES[r.id];
      if (!type) throw new ConfigError(`Rule "${r.id}" has no type (forbidden-text, file-boundary, or prettier).`);
      const rule = { ...r, type, severity: r.severity || "error" };
      if (type === "forbidden-text") {
        if (!r.pattern) throw new ConfigError(`Rule "${r.id}" needs a "pattern".`);
        try {
          rule.regex = new RegExp(r.pattern, r.flags || "");
          rule.fixes = (r.fixes || []).map((f) => ({ regex: new RegExp(f.pattern, "g" + (r.flags || "").replace("g", "")), replace: f.replace }));
        } catch (err) {
          throw new ConfigError(`Rule "${r.id}" has an invalid pattern: ${err.message}`);
        }
      }
      return rule;
    });
  return { path: configPath, rules };
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
}

function isScannable(file) {
  const base = path.basename(file);
  if (LOCKFILES.has(base)) return false;
  return !BINARY_EXTENSIONS.has(path.extname(base).toLowerCase());
}

/**
 * Returns [{ file, read() }]. In a git repo, uses git's file list so .gitignore is respected.
 * With staged: true, reads the STAGED content (what will actually be committed).
 */
export function collectFiles(targetDir, { staged = false } = {}) {
  let top = null;
  try {
    top = git(["rev-parse", "--show-toplevel"], targetDir).trim();
  } catch {
    top = null;
  }

  if (staged) {
    if (!top) throw new ConfigError("--staged needs a git repository.");
    const names = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], targetDir).split("\0").filter(Boolean);
    return names
      .map((rel) => path.join(top, rel))
      .filter((abs) => abs.startsWith(path.resolve(targetDir)) && isScannable(abs))
      .map((abs) => ({
        file: abs,
        staged: true,
        read: () => git(["show", `:${path.relative(top, abs).split(path.sep).join("/")}`], top)
      }));
  }

  if (top) {
    const listed = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], targetDir).split("\0").filter(Boolean);
    return listed
      .map((rel) => path.join(targetDir, rel))
      .filter((abs) => isScannable(abs) && fs.existsSync(abs) && fs.statSync(abs).isFile())
      .map((abs) => ({ file: abs, read: () => fs.readFileSync(abs, "utf8") }));
  }

  const results = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (WALK_IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && isScannable(full)) results.push({ file: full, read: () => fs.readFileSync(full, "utf8") });
    }
  };
  walk(targetDir);
  return results;
}

function appliesTo(rule, file) {
  if (!rule.extensions) return true;
  return rule.extensions.includes(path.extname(file).toLowerCase()) || rule.extensions.includes(path.basename(file));
}

/** Checks text against forbidden-text rules. Returns { violations, fixedText }. */
export function checkText(file, text, rules, { fix = false } = {}) {
  const violations = [];
  let fixedText = text;
  for (const rule of rules) {
    if (rule.type !== "forbidden-text" || !appliesTo(rule, file)) continue;
    const lines = text.split("\n");
    const canFix = fix && rule.fixes.length > 0;
    lines.forEach((line, i) => {
      const m = rule.regex.exec(line);
      if (!m) return;
      violations.push({
        rule: rule.id,
        file,
        line: i + 1,
        column: m.index + 1,
        message: canFix ? `Fixed: ${rule.description || rule.id}` : rule.message || rule.description || `Forbidden text matched ${rule.pattern}`,
        severity: canFix ? "info" : rule.severity,
        fixed: canFix || undefined
      });
    });
    if (canFix && violations.some((v) => v.rule === rule.id && v.file === file)) {
      for (const f of rule.fixes) fixedText = fixedText.replace(f.regex, f.replace);
    }
  }
  return { violations, fixedText };
}

function checkFileBoundary(file, text, rule, strict) {
  const extensions = rule.extensions || DEFAULT_SOURCE_EXTENSIONS;
  if (!extensions.includes(path.extname(file).toLowerCase())) return [];
  const threshold = rule.threshold || 400;
  const lineCount = text.split("\n").length;
  if (lineCount <= threshold) return [];
  return [{
    rule: rule.id,
    file,
    line: lineCount,
    column: 1,
    message: `File has ${lineCount} lines (limit ${threshold}). Consider splitting it.`,
    severity: strict ? "error" : rule.severity
  }];
}

function findPrettier(targetDir) {
  const local = path.join(targetDir, "node_modules", ".bin", process.platform === "win32" ? "prettier.cmd" : "prettier");
  if (fs.existsSync(local)) return local;
  try {
    execFileSync("prettier", ["--version"], { stdio: "ignore" });
    return "prettier";
  } catch {
    return null;
  }
}

function hasPrettierConfig(targetDir) {
  const names = [".prettierrc", ".prettierrc.json", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.mjs", ".prettierrc.yaml", ".prettierrc.yml", "prettier.config.js", "prettier.config.mjs", "prettier.config.cjs"];
  if (names.some((n) => fs.existsSync(path.join(targetDir, n)))) return true;
  try {
    return Boolean(JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf8")).prettier);
  } catch {
    return false;
  }
}

/** Prettier runs only on repos that configure it. If configured but not installed, that is reported. */
export function checkPrettier(targetDir, rule, { fix = false, files = null } = {}) {
  if (!hasPrettierConfig(targetDir)) return [];
  const cmd = findPrettier(targetDir);
  if (!cmd) {
    return [{
      rule: rule.id,
      file: path.join(targetDir, ".prettierrc"),
      line: 1,
      column: 1,
      message: "This repo configures Prettier but Prettier is not installed, so formatting was NOT checked. Run npm install.",
      severity: "warning",
      notChecked: true
    }];
  }
  const targets = files ? files.map((f) => path.relative(targetDir, f)) : ["."];
  if (targets.length === 0) return [];
  try {
    execFileSync(cmd, [fix ? "--write" : "--check", "--ignore-unknown", ...targets], { cwd: targetDir, stdio: "pipe", encoding: "utf8" });
    return [];
  } catch (err) {
    if (fix) return [];
    const output = `${err.stdout || ""}\n${err.stderr || ""}`;
    const unformatted = output
      .split("\n")
      .filter((l) => l.includes("[warn]") && !/Code style issues|Run Prettier/.test(l))
      .map((l) => l.replace(/\[warn\]\s*/, "").trim())
      .filter(Boolean);
    if (unformatted.length === 0) {
      return [{ rule: rule.id, file: targetDir, line: 1, column: 1, message: `Prettier failed: ${output.trim().slice(0, 300)}`, severity: rule.severity }];
    }
    return unformatted.map((uf) => ({
      rule: rule.id,
      file: path.resolve(targetDir, uf),
      line: 1,
      column: 1,
      message: "File does not match the repo's Prettier formatting.",
      severity: rule.severity
    }));
  }
}

/** Runs every configured rule over the target. */
export function runChecks({ targetDir, config, staged = false, fix = false, strict = false, messageFile = null }) {
  const violations = [];

  if (messageFile) {
    const text = fs.readFileSync(messageFile, "utf8");
    violations.push(...checkText(messageFile, text, config.rules.filter((r) => r.checkCommitMessages !== false)).violations);
    return { inspectedFilesCount: 1, violations };
  }

  if (fix && staged) throw new ConfigError("--fix cannot be combined with --staged (it would edit files without restaging them).");

  const files = collectFiles(targetDir, { staged });
  for (const entry of files) {
    let text;
    try {
      text = entry.read();
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    const result = checkText(entry.file, text, config.rules, { fix });
    violations.push(...result.violations);
    if (fix && result.fixedText !== text) fs.writeFileSync(entry.file, result.fixedText, "utf8");
    for (const rule of config.rules.filter((r) => r.type === "file-boundary")) {
      violations.push(...checkFileBoundary(entry.file, text, rule, strict));
    }
  }

  for (const rule of config.rules.filter((r) => r.type === "prettier")) {
    violations.push(...checkPrettier(targetDir, rule, { fix, files: staged ? files.map((f) => f.file) : null }));
  }

  return { inspectedFilesCount: files.length, violations };
}
