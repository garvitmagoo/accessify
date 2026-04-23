import * as vscode from 'vscode';
import { scanForA11yIssues } from './scanner/astScanner';
import { toVscodeSeverity } from './types';
import { loadConfig, applyConfig, isExcluded } from './config';
import { getHelpUrl } from './scanner/axeIntegration';
import { parallelScan } from './parallelScanner';

const SUPPORTED_LANGUAGES = new Set([
  'typescriptreact', 'javascriptreact', 'typescript', 'javascript', 'html',
]);

let diagnosticCollection: vscode.DiagnosticCollection;

/** Stores structured data from A11yIssue for use by code actions. */
const diagnosticDataMap = new Map<string, Record<string, string>>();

function diagnosticKey(uri: string, line: number, col: number, rule: string): string {
  return `${uri}:${line}:${col}:${rule}`;
}

/** Extract the rule ID string from a diagnostic code (handles both string and {value, target} forms). */
export function getRuleId(diagnostic: vscode.Diagnostic): string {
  const code = diagnostic.code;
  if (typeof code === 'object' && code !== null && 'value' in code) {
    return String(code.value);
  }
  return String(code);
}

/** Retrieve structured data attached to a diagnostic by the scanner rules. */
export function getDiagnosticData(uri: vscode.Uri, diagnostic: vscode.Diagnostic): Record<string, string> | undefined {
  const key = diagnosticKey(
    uri.toString(),
    diagnostic.range.start.line,
    diagnostic.range.start.character,
    getRuleId(diagnostic),
  );
  return diagnosticDataMap.get(key);
}

/** Clean up diagnostic data for a closed document. */
export function clearDiagnosticData(uri: vscode.Uri): void {
  const uriStr = uri.toString();
  for (const key of [...diagnosticDataMap.keys()]) {
    if (key.startsWith(uriStr + ':')) {
      diagnosticDataMap.delete(key);
    }
  }
}

export function initDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('a11y');
  context.subscriptions.push(diagnosticCollection);
  return diagnosticCollection;
}

export async function updateDiagnostics(document: vscode.TextDocument): Promise<void> {
  if (!SUPPORTED_LANGUAGES.has(document.languageId)) {
    return;
  }

  const config = await loadConfig();
  if (isExcluded(config, document.fileName)) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  let issues = scanForA11yIssues(document.getText(), document.fileName);
  issues = applyConfig(config, issues);

  const uriStr = document.uri.toString();
  for (const key of diagnosticDataMap.keys()) {
    if (key.startsWith(uriStr + ':')) {
      diagnosticDataMap.delete(key);
    }
  }

  const diagnostics = issues.map(issue => {
    const startPos = new vscode.Position(issue.line, issue.column);
    const endPos = issue.endLine !== undefined && issue.endColumn !== undefined
      ? new vscode.Position(issue.endLine, issue.endColumn)
      : document.lineAt(issue.line).range.end;

    const range = new vscode.Range(startPos, endPos);
    const globalSeverity = vscode.workspace.getConfiguration('a11y').get<string>('severity');
    const severity = globalSeverity && globalSeverity !== 'warning'
      ? toVscodeSeverity(globalSeverity as 'error' | 'warning' | 'info' | 'hint')
      : toVscodeSeverity(issue.severity);
    const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
    diagnostic.source = 'Accessify';

    // Add clickable help link from axe-core metadata when available
    const helpUrl = getHelpUrl(issue.rule);
    if (helpUrl) {
      diagnostic.code = { value: issue.rule, target: vscode.Uri.parse(helpUrl) };
    } else {
      diagnostic.code = issue.rule;
    }

    if (issue.data) {
      diagnosticDataMap.set(diagnosticKey(uriStr, issue.line, issue.column, issue.rule), issue.data);
    }

    return diagnostic;
  });

  diagnosticCollection.set(document.uri, diagnostics);
}

export async function scanAllOpenDocuments(): Promise<void> {
  for (const document of vscode.workspace.textDocuments) {
    await updateDiagnostics(document);
  }
}

export async function scanWorkspace(
  progress?: vscode.Progress<{ increment: number; message: string }>,
  token?: vscode.CancellationToken,
): Promise<number> {
  const excludePattern = '{**/node_modules/**,**/.env*,**/config/**,**/*.config.*,**/dist/**,**/build/**,**/coverage/**}';
  const files = await vscode.workspace.findFiles(
    '**/*.{tsx,jsx,html}',
    excludePattern
  );

  const config = await loadConfig();
  const eligible = files.filter(f => !isExcluded(config, f.fsPath));

  const results = await parallelScan(eligible, {
    token,
    filterIssues: issues => applyConfig(config, issues),
    onProgress: (completed, total, file) => {
      progress?.report({
        increment: (1 / total) * 100,
        message: `(${completed}/${total}) ${file}`,
      });
    },
  });

  diagnosticCollection.clear();
  diagnosticDataMap.clear();

  const globalSeverity = vscode.workspace.getConfiguration('a11y').get<string>('severity');

  let totalIssues = 0;
  for (const { uri, issues } of results) {
    const document = await vscode.workspace.openTextDocument(uri);
    const diagnostics = issues.map(issue => {
      const startPos = new vscode.Position(issue.line, issue.column);
      const endPos = issue.endLine !== undefined && issue.endColumn !== undefined
        ? new vscode.Position(issue.endLine, issue.endColumn)
        : document.lineAt(issue.line).range.end;
      const range = new vscode.Range(startPos, endPos);
      const severity = globalSeverity && globalSeverity !== 'warning'
        ? toVscodeSeverity(globalSeverity as 'error' | 'warning' | 'info' | 'hint')
        : toVscodeSeverity(issue.severity);
      const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
      diagnostic.source = 'Accessify';
      const issueHelpUrl = getHelpUrl(issue.rule);
      if (issueHelpUrl) {
        diagnostic.code = { value: issue.rule, target: vscode.Uri.parse(issueHelpUrl) };
      } else {
        diagnostic.code = issue.rule;
      }
      return diagnostic;
    });

    diagnosticCollection.set(uri, diagnostics);
    totalIssues += issues.length;
  }

  return totalIssues;
}
