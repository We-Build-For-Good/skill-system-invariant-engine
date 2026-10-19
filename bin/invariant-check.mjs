#!/usr/bin/env node

/**
 * We Build for Good: System Invariant Engine (CLI Runner)
 * Deterministic pre-commit and CI verification gate.
 * Enforces character-level invariants, modular file size boundaries,
 * brand boundaries, and Prettier code formatting.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  ".output",
  ".vinxi",
  "build",
  ".vercel",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "coverage",
  ".temp",
];

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".pdf", ".mp4", ".mov", ".zip", ".tar", ".gz", ".woff", ".woff2", ".ttf", ".eot"
]);

const SOURCE_CODE_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".css", ".scss", ".html"
]);

// Parse CLI flags
const args = process.argv.slice(2);
const options = {
  dir: process.cwd(),
  staged: false,
  fix: false,
  strict: false,
  json: false,
  maxLines: 400,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--dir" && args[i + 1]) options.dir = path.resolve(args[++i]);
  else if (arg === "--staged") options.staged = true;
  else if (arg === "--fix") options.fix = true;
  else if (arg === "--strict") options.strict = true;
  else if (arg === "--json") options.json = true;
  else if (arg === "--max-lines" && args[i + 1]) options.maxLines = parseInt(args[++i], 10) || 400;
}

function getFilesToInspect(targetDir, stagedOnly) {
  if (stagedOnly) {
    try {
      const output = execSync("git diff --cached --name-only --diff-filter=ACMR", {
        cwd: targetDir,
        encoding: "utf8",
      });
      return output
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => path.join(targetDir, f))
        .filter((f) => fs.existsSync(f) && !fs.statSync(f).isDirectory());
    } catch {
      // Fallback to directory walk
    }
  }

  const results = [];
  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return; // Skip directories without read permission
    }
    for (const entry of entries) {
      if (DEFAULT_IGNORE.includes(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!BINARY_EXTENSIONS.has(ext)) results.push(fullPath);
      }
    }
  }

  walk(targetDir);
  return results;
}

function checkEmDashInvariant(filePath, content, fixMode) {
  const violations = [];
  const lines = content.split("\n");
  let modified = false;
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("\u2014")) {
      const col = line.indexOf("\u2014") + 1;
      if (fixMode) {
        const fixedLine = line.replace(/ \u2014 /g, ": ").replace(/\u2014/g, ", ");
        newLines.push(fixedLine);
        modified = true;
        violations.push({
          rule: "rule-syntax-em-dash",
          file: filePath,
          line: i + 1,
          column: col,
          message: "Repaired forbidden em dash. Replaced with colon or comma.",
          severity: "info",
          fixed: true,
        });
      } else {
        violations.push({
          rule: "rule-syntax-em-dash",
          file: filePath,
          line: i + 1,
          column: col,
          message: "Forbidden em dash detected. Use colons, commas, or parentheses instead.",
          severity: "error",
        });
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  if (fixMode && modified) fs.writeFileSync(filePath, newLines.join("\n"), "utf8");
  return violations;
}

function checkFileBoundaryInvariant(filePath, lineCount, maxLines, strictMode) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SOURCE_CODE_EXTENSIONS.has(ext)) return [];
  if (lineCount > maxLines) {
    return [{
      rule: "rule-file-boundary",
      file: filePath,
      line: lineCount,
      column: 1,
      message: `File exceeds modularity threshold (${lineCount} lines > ${maxLines} lines). Refactor into modular components.`,
      severity: strictMode ? "error" : "warning",
    }];
  }
  return [];
}

function checkBrandIntegrity(filePath, content, fixMode) {
  const violations = [];
  if (![".html", ".xml", ".md", ".json"].includes(path.extname(filePath).toLowerCase())) {
    return violations;
  }

  const obsoleteRules = [
    {
      name: "frcem100-staging",
      test: /frcem100\.drlizlondon\.workers\.dev/,
      canonical: "https://webuildforgood.com/frcem100/",
      fix: (str) =>
        str
          .replace(/https?:\/\/frcem100\.drlizlondon\.workers\.dev\/?/g, "https://webuildforgood.com/frcem100/")
          .replace(/frcem100\.drlizlondon\.workers\.dev/g, "webuildforgood.com/frcem100/"),
    },
    {
      name: "departure-alarm-staging",
      test: /drlizlondon\.github\.io\/departure-alarm/,
      canonical: "https://webuildforgood.com/departure-alarm/",
      fix: (str) =>
        str
          .replace(/https?:\/\/drlizlondon\.github\.io\/departure-alarm\/?/g, "https://webuildforgood.com/departure-alarm/")
          .replace(/drlizlondon\.github\.io\/departure-alarm/g, "webuildforgood.com/departure-alarm/"),
    },
  ];

  let modified = false;
  let newContent = content;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of obsoleteRules) {
      if (rule.test.test(line)) {
        if (fixMode) {
          violations.push({
            rule: "rule-brand-integrity",
            file: filePath,
            line: i + 1,
            column: 1,
            message: `Repaired obsolete staging domain to canonical studio route (${rule.canonical}).`,
            severity: "info",
            fixed: true,
          });
          modified = true;
        } else {
          violations.push({
            rule: "rule-brand-integrity",
            file: filePath,
            line: i + 1,
            column: 1,
            message: `Obsolete staging domain detected. Use canonical studio route (${rule.canonical}).`,
            severity: "error",
          });
        }
      }
    }
  }

  if (fixMode && modified) {
    for (const rule of obsoleteRules) {
      newContent = rule.fix(newContent);
    }
    fs.writeFileSync(filePath, newContent, "utf8");
  }

  return violations;
}

function checkPrettier(targetDir, fixMode) {
  const prettierrcPaths = [
    path.join(targetDir, ".prettierrc"),
    path.join(targetDir, ".prettierrc.json"),
    path.join(targetDir, ".prettierrc.js"),
  ];
  if (!prettierrcPaths.some((p) => fs.existsSync(p))) return [];

  let prettierCmd = null;
  const localPrettier = path.join(targetDir, "node_modules", ".bin", "prettier");
  if (fs.existsSync(localPrettier)) prettierCmd = localPrettier;
  else {
    try {
      execSync("which prettier", { stdio: "ignore" });
      prettierCmd = "prettier";
    } catch {
      // Prettier not available in PATH
    }
  }
  if (!prettierCmd) return [];

  const violations = [];
  try {
    const flag = fixMode ? "--write" : "--check";
    execSync(`${prettierCmd} ${flag} --ignore-unknown .`, {
      cwd: targetDir,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (err) {
    if (!fixMode && err.stdout) {
      const output = err.stdout.toString();
      const unformatted = output
        .split("\n")
        .filter((l) => l.includes("[warn]") && !l.includes("Code style issues found"))
        .map((l) => l.replace(/\[warn\]\s*/, "").trim())
        .filter(Boolean);

      for (const uf of unformatted) {
        violations.push({
          rule: "rule-format-prettier",
          file: path.resolve(targetDir, uf),
          line: 1,
          column: 1,
          message: "File does not match studio Prettier code formatting.",
          severity: "error",
        });
      }
    }
  }
  return violations;
}

function run() {
  const targetDir = options.dir;
  const files = getFilesToInspect(targetDir, options.staged);
  const allViolations = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8");
      const lineCount = content.split("\n").length;
      allViolations.push(...checkEmDashInvariant(file, content, options.fix));
      allViolations.push(...checkFileBoundaryInvariant(file, lineCount, options.maxLines, options.strict));
      allViolations.push(...checkBrandIntegrity(file, content, options.fix));
    } catch {
      // Skip unreadable files
    }
  }

  allViolations.push(...checkPrettier(targetDir, options.fix));

  const errors = allViolations.filter((v) => v.severity === "error");
  const warnings = allViolations.filter((v) => v.severity === "warning");

  if (options.json) {
    console.log(JSON.stringify({
      targetDir,
      inspectedFilesCount: files.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      violations: allViolations,
    }, null, 2));
    process.exit(errors.length > 0 ? 1 : 0);
  }

  console.log("===========================================================");
  console.log(" We Build for Good: System Invariant Engine");
  console.log(` Target Directory      : ${targetDir}`);
  console.log(` Inspected Files       : ${files.length}`);
  console.log(` Errors Found          : ${errors.length}`);
  console.log(` Warnings Found        : ${warnings.length}`);
  console.log("===========================================================");

  if (allViolations.length === 0) {
    console.log("\nAll system invariants verified clean.\n");
    process.exit(0);
  }

  console.log("");
  for (const v of allViolations) {
    const relPath = path.relative(targetDir, v.file);
    const tag = v.severity === "error" ? "ERROR" : (v.severity === "info" ? "INFO " : "WARN ");
    console.log(`[${tag}] [${v.rule}] ${relPath}:${v.line}:${v.column}`);
    console.log(`        ${v.message}`);
  }
  console.log("");

  if (errors.length > 0) {
    console.log("System invariant check failed. Resolve errors before committing.\n");
    process.exit(1);
  } else {
    console.log("System invariant check passed with warnings.\n");
    process.exit(0);
  }
}

run();
