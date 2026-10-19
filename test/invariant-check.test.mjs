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

test("detects obsolete staging domains in public HTML", () => {
  const htmlFile = path.join(TMP_DIR, "index.html");
  fs.writeFileSync(
    htmlFile,
    '<a href="https://frcem100.drlizlondon.workers.dev">Old Demo Link</a>\n',
    "utf8",
  );

  const cmd = `node "${CLI_PATH}" --dir "${TMP_DIR}" --json`;
  try {
    execSync(cmd, { encoding: "utf8" });
    assert.fail("CLI should have exited with error code");
  } catch (err) {
    const result = JSON.parse(err.stdout);
    assert.equal(result.errorCount, 1);
    assert.equal(result.violations[0].rule, "rule-brand-integrity");
  }
});

test("--fix automatically repairs obsolete staging domains", () => {
  const htmlFile = path.join(TMP_DIR, "index.html");
  fs.writeFileSync(
    htmlFile,
    '<link rel="canonical" href="https://drlizlondon.github.io/departure-alarm/">\n',
    "utf8",
  );

  const cmd = `node "${CLI_PATH}" --dir "${TMP_DIR}" --fix --json`;
  const output = execSync(cmd, { encoding: "utf8" });
  const result = JSON.parse(output);

  const repaired = fs.readFileSync(htmlFile, "utf8");
  assert.equal(repaired.includes("drlizlondon"), false);
  assert.equal(repaired, '<link rel="canonical" href="https://webuildforgood.com/departure-alarm/">\n');
});

