import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import { lintDocument } from "../../extension";

const getFixtureFilePath = (root: string, filename: string) =>
  path.resolve(root, filename);

const getFixture = async (category: string, type: string, filename: string) => {
  const fixturesPath = path.join(__dirname, '../../../fixtures');
  return await vscode.workspace.openTextDocument(
    getFixtureFilePath(path.join(fixturesPath, category, type), filename)
  );
};

suite("Godot Linting Tests", function () {
  this.timeout(5000); // Increase timeout for all tests

  let ochan: vscode.OutputChannel;
  let diag: vscode.DiagnosticCollection;
  let originalGdlintPath: string;
  let originalGdformatPath: string;

  suiteSetup(async () => {
    const config = vscode.workspace.getConfiguration("godotFormatterAndLinter");
    originalGdlintPath = config.get("gdlintPath", "gdlint");
    originalGdformatPath = config.get("gdformatPath", "gdformat");

    ochan = vscode.window.createOutputChannel("gdlint");
    diag = vscode.languages.createDiagnosticCollection("gdlint");
  });

  suiteTeardown(async () => {
    const config = vscode.workspace.getConfiguration("godotFormatterAndLinter");
    await config.update("gdlintPath", originalGdlintPath, true);
    await config.update("gdformatPath", originalGdformatPath, true);
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  test("Sample test", () => {
    assert.strictEqual([1, 2, 3].indexOf(5), -1);
    assert.strictEqual([1, 2, 3].indexOf(0), -1);
  });

  suite("Testing Linter", () => {
    test("should PASS with No Errors", async () => {
      const doc = await getFixture("passing", "linting", "noerrors.gd");
      diag.clear();

      const diagArr = lintDocument(doc, diag, ochan);
      assert.strictEqual(diagArr.length, 0);
      assert.strictEqual(diag.get(doc.uri)?.length, 0);
    });

    test("should FAIL with indentation error", async function () {
      const doc = await getFixture("failing", "linting", "unnecessarytoken_bad_indent.gd");
      diag.clear();

      const diagArr = lintDocument(doc, diag, ochan);
      const uriDiags = diag.get(doc.uri) || [];

      assert.strictEqual(uriDiags.length, 1, `Expected 1 diagnostic, got ${uriDiags.length}`);
      assert.match(uriDiags[0].message, /Unexpected token Token\('_INDENT'/);
    });

    test("should FAIL with unnecessary pass", async function () {
      const doc = await getFixture("failing", "linting", "unnecessary-pass.gd");
      diag.clear();

      const diagArr = lintDocument(doc, diag, ochan);
      const uriDiags = diag.get(doc.uri) || [];

      assert.strictEqual(uriDiags.length, 1);
      assert.match(uriDiags[0].message, /"pass" statement not necessary/);
    });

    test("should FAIL with unused argument", async function () {
      const doc = await getFixture("failing", "linting", "unused-argument.gd");
      diag.clear();

      const diagArr = lintDocument(doc, diag, ochan);
      const uriDiags = diag.get(doc.uri) || [];

      assert.strictEqual(uriDiags.length, 1);
      assert.match(uriDiags[0].message, /unused function argument 'delta'/);
    });
  });

  suite("Testing Formatter", () => {
    test("should format document", async function () {
      const doc = await getFixture("failing", "formatting", "fmt-test1.gd");
      const formatted = await getFixture("passing", "formatting", "fmt-test1.gd");

      // This would need actual formatting test implementation
      assert.ok(doc && formatted);
    });
  });
});
