import * as cp from "child_process";
import * as os from "os";
import * as vscode from "vscode";

// Error pattern matchers
export const matchRegexError: RegExp = /(\w+\.gd):(\d+):\s?Error:\s?(.+)?/g;
export const matchRegexToken: RegExp = /(.+) at line (\d+), column (\d+)\./gm;
export const matchRegexUnexpectedToken: RegExp =
  /Token(.+):(\d+):(\d+): Unexpected token(.+)/g;
export const matchRegexTokenFile: RegExp = /['|"]?(.+\.gd):['|"]?/g;

const severityLevel = vscode.workspace
  .getConfiguration("godotFormatterAndLinter")
  .get("lintSeverityLevel", "Error");

let timeout: NodeJS.Timeout | undefined = undefined;

// Returns true if matched an error
export const scanLineForGeneralError = (
  line: string,
  diagArr: vscode.Diagnostic[],
  code: string,
  ochan: vscode.OutputChannel
): boolean => {
  const match = matchRegexError.exec(line);
  if (!match) return false;

  const filename = match[1];
  const lineno = parseInt(match[2]) - 1;
  const message = match[3];

  ochan.append(`Error: ${filename}:${lineno}: ${message}\n`);
  diagArr.push(new vscode.Diagnostic(
    new vscode.Range(lineno, 0, lineno, line.length - 1),
    message,
    vscode.DiagnosticSeverity[severityLevel]
  ));
  return true;
};

// Returns true if matched a token error  
export const scanLineForTokenError = (
  line: string,
  diagArr: vscode.Diagnostic[],
  code: string,
  ochan: vscode.OutputChannel
): boolean => {
  let tokenFile = "";
  const fileMatch = matchRegexTokenFile.exec(line);
  if (fileMatch) tokenFile = fileMatch[1];

  const match = matchRegexToken.exec(line);
  if (!match) return false;

  const message = match[1];
  const lineno = parseInt(match[2]);
  const colno = parseInt(match[3]);

  ochan.append(`Token: ${tokenFile}:${lineno}:${colno}: ${message}\n`);
  diagArr.push(new vscode.Diagnostic(
    new vscode.Range(lineno, 0, lineno, line.length - 1),
    message,
    vscode.DiagnosticSeverity[severityLevel]
  ));
  return true;
};

// Returns true if matched an unexpected token error
export const scanLineForUnexpectedTokenError = (
  line: string,
  diagArr: vscode.Diagnostic[],
  code: string,
  ochan: vscode.OutputChannel
): boolean => {
  let tokenFile = "";
  const fileMatch = matchRegexTokenFile.exec(line);
  if (fileMatch) tokenFile = fileMatch[1];

  const match = matchRegexUnexpectedToken.exec(line);
  if (!match) return false;

  const message = match[4];
  const lineno = parseInt(match[2]);
  const colno = parseInt(match[3]);

  ochan.append(`Token: ${tokenFile}:${lineno}:${colno}: ${message}\n`);
  diagArr.push(new vscode.Diagnostic(
    new vscode.Range(lineno, 0, lineno, line.length - 1),
    message,
    vscode.DiagnosticSeverity[severityLevel]
  ));
  return true;
};

export async function formatDocument(
  document: vscode.TextDocument
): Promise<vscode.TextEdit[]> {
  const content = document.getText();
  const config = vscode.workspace.getConfiguration("godotFormatterAndLinter");
  const indentType = config.get("indentType");
  const indentSpacesSize = config.get("indentSpacesSize");
  const indentParam = indentType === "Tabs" ? "" : `--use-spaces=${indentSpacesSize}`;
  const lineLength = config.get("lineLength");
  const gdformatPath = config.get("gdformatPath", "gdformat");

  return new Promise((resolve, reject) => {
    const cmd = `${gdformatPath} --line-length=${lineLength} ${indentParam} -`;
    const cpo = cp.exec(cmd, (err, stdout) => {
      if (err) return reject(err);
      resolve([
        vscode.TextEdit.replace(
          new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(document.lineCount, 9999999)
          ),
          stdout
        )
      ]);
    });
    cpo.stdin?.write(content);
    cpo.stdin?.end(os.EOL);
  });
}

export const lintDocument = (
  doc: vscode.TextDocument,
  diag: vscode.DiagnosticCollection,
  ochan: vscode.OutputChannel
): vscode.Diagnostic[] => {
  const diagArr: vscode.Diagnostic[] = [];
  if (doc.uri.scheme !== "file" || doc.languageId !== "gdscript") {
    return diagArr;
  }

  const gdlintPath = vscode.workspace
    .getConfiguration("godotFormatterAndLinter")
    .get("gdlintPath", "gdlint");

  const cmd = `${gdlintPath} "${doc.fileName}" 2>&1`;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const result = cp.spawnSync(cmd, {
    shell: true,
    stdio: "pipe",
    cwd: workspaceFolder?.uri.fsPath,
  });

  // Log raw output for debugging
  console.log('gdlint stdout:', result.stdout?.toString());
  console.log('gdlint stderr:', result.stderr?.toString());

  const lines: string[] = [];
  if (result.stdout) lines.push(...result.stdout.toString().split('\n'));
  if (result.stderr) lines.push(...result.stderr.toString().split('\n'));

  lines
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .forEach(line => {
      matchRegexTokenFile.lastIndex = 0;
      matchRegexError.lastIndex = 0;
      matchRegexUnexpectedToken.lastIndex = 0;

      // Try all error patterns
      if (!scanLineForGeneralError(line, diagArr, "gdlint", ochan) &&
        !scanLineForTokenError(line, diagArr, "gdlint", ochan) &&
        !scanLineForUnexpectedTokenError(line, diagArr, "gdlint", ochan)) {
        // Fallback for unmatched errors
        if (line.includes('Error:') || line.includes('error:')) {
          diagArr.push(new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 10),
            line,
            vscode.DiagnosticSeverity.Error
          ));
        }
      }
    });

  diag.set(doc.uri, diagArr);
  return diagArr;
};

export function activate(context: vscode.ExtensionContext) {
  const extension = vscode.extensions.getExtension("eddiedover.gdscript-formatter-linter");
  const version = extension?.packageJSON.version;
  console.log(`'GDScript Formatter & Linter' ${version} is now active!`);

  const ochan = vscode.window.createOutputChannel("Godot Formatter");
  const diag = vscode.languages.createDiagnosticCollection("gdlint");

  // Setup document change listeners
  const lintOnChange = (doc: vscode.TextDocument) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => lintDocument(doc, diag, ochan), 300);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) lintOnChange(editor.document);
    }),
    vscode.workspace.onDidChangeTextDocument(editor => {
      if (!editor.document.isDirty) lintOnChange(editor.document);
    }),
    vscode.languages.registerDocumentFormattingEditProvider("gdscript", {
      provideDocumentFormattingEdits: formatDocument
    })
  );
}

export function deactivate() { }
