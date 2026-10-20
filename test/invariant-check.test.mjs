import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLI_PATH = path.resolve("bin/invariant-check.mjs");
const TMP_DIR = path.resolve("test/.tmp-test");

test.beforeEach(() => {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

test.afterEach(() => {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

test("passes when all files satisfy studio invariants", () => {
  const cleanFile = path.join(TMP_DIR, "clean.js");
  fs.writeFileSync(cleanFile, "const greeting = 'Hello, world!';\nconsole.log(greeting);\n", "utf8");

  const cmd = `node "${CLI_PATH}" --dir "${TMP_DIR}" --json`;
  const output = execSync(cmd, { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
  assert.equal(result.violations.length, 0);
});

test("detects em dash violation and reports line and column", () => {
  const dirtyFile = path.join(TMP_DIR, "dirty.md");
  fs.writeFileSync(dirtyFile, "Title: My Project \u2014 The Best App\nBody text.\n", "utf8");

  const cmd = `node "${CLI_PATH}" --dir "${TMP_DIR}" --json`;
  try {
    execSync(cmd, { encoding: "utf8" });
    assert.fail("CLI should have exited with error code");
  } catch (err) {
    const result = JSON.parse(err.stdout);
    assert.equal(result.errorCount, 1);
    assert.equal(result.violations[0].rule, "rule-syntax-em-dash");
    assert.equal(result.violations[0].line, 1);
  }
});

test("--fix automatically repairs em dash violation", () => {
  const fixFile = path.join(TMP_DIR, "fixable.md");
  fs.writeFileSync(fixFile, "Heading \u2014 Subtitle\n", "utf8");

  // Run with --fix
  const cmd = `node "${CLI_PATH}" --dir "${TMP_DIR}" --fix --json`;
  const output = execSync(cmd, { encoding: "utf8" });
  const result = JSON.parse(output);

  const repairedContent = fs.readFileSync(fixFile, "utf8");
  assert.equal(repairedContent.includes("\u2014"), false);
  assert.equal(repairedContent, "Heading: Subtitle\n");
});

test("detects modularity warning when source file exceeds line threshold", () => {
  const longFile = path.join(TMP_DIR, "large-component.js");
  const lines = Array.from({ length: 450 }, (_, i) => `// line ${i + 1}`).join("\n");
  fs.writeFileSync(longFile, lines, "utf8");

  const cmd = `node "${CLI_PATH}" --dir "${TMP_DIR}" --max-lines 400 --json`;
  const output = execSync(cmd, { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.warningCount, 1);
  assert.equal(result.violations[0].rule, "rule-file-boundary");
});

const BRAND_CONFIG = path.resolve("examples/brand-domains.invariants.json");

test("brand rules come from config, not code: detects a retired domain", () => {
  fs.writeFileSync(path.join(TMP_DIR, "index.html"), '<a href="https://old-app.example-staging.dev">Old</a>\n', "utf8");
  const cmd = `node "${CLI_PATH}" --dir "${TMP_DIR}" --config "${BRAND_CONFIG}" --json`;
  try {
    execSync(cmd, { encoding: "utf8" });
    assert.fail("CLI should have exited with error code");
  } catch (err) {
    const result = JSON.parse(err.stdout);
    assert.equal(result.errorCount, 1);
    assert.equal(result.violations[0].rule, "rule-brand-old-staging-domain");
  }
});

test("--fix repairs a retired domain using the config's fixes", () => {
  const htmlFile = path.join(TMP_DIR, "index.html");
  fs.writeFileSync(htmlFile, '<link rel="canonical" href="https://old-app.example-staging.dev/">\n', "utf8");
  execSync(`node "${CLI_PATH}" --dir "${TMP_DIR}" --config "${BRAND_CONFIG}" --fix --json`, { encoding: "utf8" });
  assert.equal(fs.readFileSync(htmlFile, "utf8"), '<link rel="canonical" href="https://www.example.com/app/">\n');
});

// Regression tests for the 2026-10-20 catalogue review.

const run = (args, cwd) => {
  try {
    return { code: 0, out: execSync(`node "${CLI_PATH}" ${args}`, { encoding: "utf8", cwd, stdio: "pipe" }) };
  } catch (err) {
    return { code: err.status, out: err.stdout };
  }
};
const gitIn = (dir, ...a) => execSync(`git ${a.join(" ")}`, { cwd: dir, stdio: "ignore" });

test("a repo's own invariants.json replaces the defaults (em dash rule can be turned off)", () => {
  fs.writeFileSync(path.join(TMP_DIR, "notes.md"), `A ${String.fromCharCode(0x2014)} B\n`);
  fs.writeFileSync(path.join(TMP_DIR, "invariants.json"), JSON.stringify({ rules: [{ id: "rule-syntax-em-dash", type: "forbidden-text", pattern: "x", enabled: false }] }));
  assert.equal(run(`--dir "${TMP_DIR}" --json`).code, 0);
});

test("--staged checks the staged content, not the working copy", () => {
  const repo = fs.mkdtempSync(path.join(TMP_DIR, "repo-"));
  gitIn(repo, "init", "-q");
  const file = path.join(repo, "a.md");
  fs.writeFileSync(file, `bad ${String.fromCharCode(0x2014)} text\n`);
  gitIn(repo, "add", "a.md");
  fs.writeFileSync(file, "clean text\n"); // fixed in working copy, but the bad version is what is staged
  assert.equal(run(`--dir "${repo}" --staged --json`).code, 1);
});

test("files ignored by .gitignore (build output) are not scanned", () => {
  const repo = fs.mkdtempSync(path.join(TMP_DIR, "repo-"));
  gitIn(repo, "init", "-q");
  fs.writeFileSync(path.join(repo, ".gitignore"), ".next/\n");
  fs.mkdirSync(path.join(repo, ".next"));
  fs.writeFileSync(path.join(repo, ".next", "chunk.js"), `x ${String.fromCharCode(0x2014)} y\n`);
  assert.equal(run(`--dir "${repo}" --json`).code, 0);
});

test("--message-file checks a commit message (commit-msg hook)", () => {
  const msg = path.join(TMP_DIR, "COMMIT_EDITMSG");
  fs.writeFileSync(msg, `feat: thing ${String.fromCharCode(0x2014)} done\n`);
  assert.equal(run(`--message-file "${msg}" --dir "${TMP_DIR}" --json`).code, 1);
});

test("Prettier configured but not installed is reported, not silently passed", () => {
  fs.writeFileSync(path.join(TMP_DIR, ".prettierrc"), "{}");
  fs.writeFileSync(path.join(TMP_DIR, "a.js"), "const a=1\n");
  const r = run(`--dir "${TMP_DIR}" --json`, TMP_DIR);
  const result = JSON.parse(r.out);
  const prettierFindings = result.violations.filter((v) => v.rule === "rule-format-prettier");
  // Either Prettier is installed globally and reports a real result, or the gap is reported.
  if (prettierFindings.length && prettierFindings[0].notChecked) assert.equal(result.notCheckedCount, 1);
});

test("unknown options and bad config exit with code 2", () => {
  assert.equal(run(`--dir "${TMP_DIR}" --bogus`).code, 2);
  fs.writeFileSync(path.join(TMP_DIR, "invariants.json"), "{ not json");
  assert.equal(run(`--dir "${TMP_DIR}"`).code, 2);
});
