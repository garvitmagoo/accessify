import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
let lastUri: string | undefined;
let lastScore: number | undefined;
let lastCount: number | undefined;
let workspaceScore: number | undefined;
let workspaceIssueCount: number | undefined;

export function createStatusBarItem(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'a11y.showReport';
  statusBarItem.tooltip = 'Accessibility score — click to view report';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();
  updateStatusBarScore();
  return statusBarItem;
}

/** Update workspace-level score after a workspace scan. */
export function setWorkspaceScore(_totalFiles: number, totalIssues: number): void {
  const allDiags: vscode.Diagnostic[] = [];
  for (const [, diags] of vscode.languages.getDiagnostics()) {
    allDiags.push(...diags.filter(d => d.source === 'Accessify'));
  }
  workspaceScore = computeScore(allDiags);
  workspaceIssueCount = totalIssues;
  lastUri = undefined; // force re-render
  updateStatusBarScore();
}

export function updateStatusBarScore(): void {
  if (!statusBarItem) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    // Keep the last displayed score when switching to a non-editor tab
    // (e.g. webview panels like Screen Reader Preview)
    return;
  }

  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
    .filter(d => d.source === 'Accessify');

  const currentUri = editor.document.uri.toString();
  const score = computeScore(diagnostics);
  const count = diagnostics.length;

  // Refresh workspace score if we had one
  if (workspaceScore !== undefined) {
    const allDiags: vscode.Diagnostic[] = [];
    for (const [, diags] of vscode.languages.getDiagnostics()) {
      allDiags.push(...diags.filter(d => d.source === 'Accessify'));
    }
    workspaceScore = computeScore(allDiags);
    workspaceIssueCount = allDiags.length;
  }

  if (currentUri === lastUri && score === lastScore && count === lastCount) {
    return;
  }
  lastUri = currentUri;
  lastScore = score;
  lastCount = count;

  // Build severity breakdown for tooltip
  const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
  const warnings = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
  const infos = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Information).length;
  const hints = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Hint).length;

  const breakdownParts: string[] = [];
  if (errors > 0) { breakdownParts.push(`${errors} error(s)`); }
  if (warnings > 0) { breakdownParts.push(`${warnings} warning(s)`); }
  if (infos > 0) { breakdownParts.push(`${infos} info`); }
  if (hints > 0) { breakdownParts.push(`${hints} hint(s)`); }
  const breakdown = breakdownParts.join(', ');

  const wsSuffix = workspaceScore !== undefined ? ` | WS: ${workspaceScore}/100` : '';
  const wsTooltip = workspaceScore !== undefined
    ? `\nWorkspace: ${workspaceScore}/100 (${workspaceIssueCount} issue(s))`
    : '';

  if (diagnostics.length === 0) {
    statusBarItem.text = `$(check) Accessify: ${score}/100${wsSuffix}`;
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip = `No issues in this file${wsTooltip}`;
  } else if (score >= 80) {
    statusBarItem.text = `$(check) Accessify: ${score}/100${wsSuffix}`;
    statusBarItem.backgroundColor = undefined;
    statusBarItem.tooltip = `${breakdown}${wsTooltip}`;
  } else if (score >= 50) {
    statusBarItem.text = `$(warning) Accessify: ${score}/100${wsSuffix}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.tooltip = `${breakdown}${wsTooltip}`;
  } else {
    statusBarItem.text = `$(error) Accessify: ${score}/100${wsSuffix}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.tooltip = `${breakdown}${wsTooltip}`;
  }
}

function computeScore(diagnostics: vscode.Diagnostic[]): number {
  let penalty = 0;

  for (const d of diagnostics) {
    switch (d.severity) {
      case vscode.DiagnosticSeverity.Error:
        penalty += 10;
        break;
      case vscode.DiagnosticSeverity.Warning:
        penalty += 5;
        break;
      case vscode.DiagnosticSeverity.Information:
        penalty += 2;
        break;
      case vscode.DiagnosticSeverity.Hint:
        penalty += 1;
        break;
    }
  }

  return Math.max(0, 100 - penalty);
}
