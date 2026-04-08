import * as vscode from 'vscode';
import type { PrReviewResult } from '../types';
import { escapeHtml as esc, getNonce, getCommandBarCss, getCommandBarHtml, getCommandBarJs, ALLOWED_COMMANDS } from './utils';

export class PrReviewPanel {
  public static readonly viewType = 'a11yPrReview';
  private static instance: PrReviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  private constructor(panel: vscode.WebviewPanel, result: PrReviewResult) {
    this.panel = panel;
    this.panel.webview.html = buildPrReviewHtml(result, this.panel.webview);

    this.panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'runCommand' && msg.command && ALLOWED_COMMANDS.has(msg.command)) {
        vscode.commands.executeCommand(msg.command);
        return;
      }
      if (msg.command === 'openFile' && typeof msg.file === 'string') {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const uri = vscode.Uri.joinPath(workspaceFolder.uri, msg.file);
          if (!uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) { return; }
          const line = typeof msg.line === 'number' ? msg.line : 0;
          vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(line, 0, line, 0),
          });
        }
      }
    });

    this.panel.onDidDispose(() => {
      this.disposed = true;
      PrReviewPanel.instance = undefined;
    });
  }

  public static createOrShow(_context: vscode.ExtensionContext, result: PrReviewResult): void {
    if (PrReviewPanel.instance && !PrReviewPanel.instance.disposed) {
      PrReviewPanel.instance.panel.reveal(vscode.ViewColumn.Beside);
      PrReviewPanel.instance.panel.webview.html = buildPrReviewHtml(result, PrReviewPanel.instance.panel.webview);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PrReviewPanel.viewType,
      'A11y PR Review',
      vscode.ViewColumn.Beside,
      { enableScripts: true },
    );

    PrReviewPanel.instance = new PrReviewPanel(panel, result);
  }
}

/* ── HTML builder ───────────────────────────────────────────────────────── */

function buildPrReviewHtml(r: PrReviewResult, webview: vscode.Webview): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;

  const verdictClass = r.pass ? 'pass' : 'fail';
  const verdictIcon = r.pass ? '✅' : '❌';
  const verdictText = r.pass
    ? 'No new accessibility issues introduced'
    : `${r.totalNew} new accessibility issue(s) introduced`;

  const isGitHubPr = !!r.prNumber;
  const prHeader = isGitHubPr
    ? `<div class="pr-header">
        <h1>${esc(`#${r.prNumber}  ${r.prTitle ?? ''}`)}</h1>
        <div class="pr-meta">
          <span class="pr-author">by <strong>${esc(r.prAuthor ?? '')}</strong></span>
          <span class="pr-branches"><code>${esc(r.currentBranch)}</code> → <code>${esc(r.baseBranch)}</code></span>
          ${r.prUrl ? `<a class="pr-link" href="${esc(r.prUrl)}">View on GitHub ↗</a>` : ''}
        </div>
      </div>`
    : `<h1>Accessibility PR Review</h1>
       <div class="branch-info">
         <code>${esc(r.currentBranch)}</code> → <code>${esc(r.baseBranch)}</code>
       </div>`;

  const filesWithNewIssues = r.files.filter(f => f.newIssues.length > 0);
  const filesWithFixedIssues = r.files.filter(f => f.fixedIssues.length > 0);

  // Build file sections
  const fileSections = r.files.map(f => {
    const statusBadge =
      f.status === 'added' ? '<span class="file-badge added">ADDED</span>' :
      f.status === 'renamed' ? '<span class="file-badge renamed">RENAMED</span>' :
      '<span class="file-badge modified">MODIFIED</span>';

    const newRows = f.newIssues.map(i => `
      <tr class="issue-row new">
        <td class="badge-cell"><span class="badge new-badge">NEW</span></td>
        <td class="clickable" data-file="${esc(f.file)}" data-line="${i.line}">${esc(i.message)}</td>
        <td><code>${esc(i.rule)}</code></td>
        <td class="severity ${i.severity}">${esc(i.severity)}</td>
        <td class="line-num">L${i.line}</td>
      </tr>`).join('');

    const fixedRows = f.fixedIssues.map(i => `
      <tr class="issue-row fixed">
        <td class="badge-cell"><span class="badge fixed-badge">FIXED</span></td>
        <td>${esc(i.message)}</td>
        <td><code>${esc(i.rule)}</code></td>
        <td class="severity ${i.severity}">${esc(i.severity)}</td>
        <td class="line-num">L${i.line}</td>
      </tr>`).join('');

    const hasIssues = f.newIssues.length > 0 || f.fixedIssues.length > 0;
    const fileClass = f.newIssues.length > 0 ? 'has-new' : f.fixedIssues.length > 0 ? 'has-fixed' : 'clean';

    return `
    <div class="file-section ${fileClass}">
      <div class="file-header" role="button" tabindex="0">
        <span class="collapse-icon">▸</span>
        <span class="file-name clickable" data-file="${esc(f.file)}" data-line="0">${esc(f.file)}</span>
        ${statusBadge}
        ${f.newIssues.length > 0 ? `<span class="file-count new-count">${f.newIssues.length} new</span>` : ''}
        ${f.fixedIssues.length > 0 ? `<span class="file-count fixed-count">${f.fixedIssues.length} fixed</span>` : ''}
        ${!hasIssues ? '<span class="file-count clean-count">no changes</span>' : ''}
      </div>
      <div class="file-body" style="display:none;">
        ${hasIssues ? `<table><tbody>${newRows}${fixedRows}</tbody></table>` : '<p class="empty">No accessibility changes in this file.</p>'}
      </div>
    </div>`;
  }).join('');

  // Build rule summary
  const ruleMap = new Map<string, { rule: string; newCount: number; fixedCount: number }>();
  for (const f of r.files) {
    for (const i of f.newIssues) {
      const entry = ruleMap.get(i.rule) ?? { rule: i.rule, newCount: 0, fixedCount: 0 };
      entry.newCount++;
      ruleMap.set(i.rule, entry);
    }
    for (const i of f.fixedIssues) {
      const entry = ruleMap.get(i.rule) ?? { rule: i.rule, newCount: 0, fixedCount: 0 };
      entry.fixedCount++;
      ruleMap.set(i.rule, entry);
    }
  }

  const ruleRows = [...ruleMap.values()]
    .sort((a, b) => b.newCount - a.newCount)
    .map(r => `
      <tr>
        <td><code>${esc(r.rule)}</code></td>
        <td class="num ${r.newCount > 0 ? 'new-count' : ''}">${r.newCount}</td>
        <td class="num ${r.fixedCount > 0 ? 'fixed-count' : ''}">${r.fixedCount}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>A11y PR Review</title>
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; margin: 0; }
    h1 { font-size: 1.3em; margin: 0 0 4px; }
    .subtitle { opacity: .7; font-size: .85em; margin-bottom: 16px; }
    .branch-info { font-size: .85em; opacity: .8; margin-bottom: 16px; }
    .branch-info code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; }

    /* Verdict banner */
    .verdict { padding: 14px 18px; border-radius: 8px; margin-bottom: 20px; font-size: 1.05em; font-weight: 600; display: flex; align-items: center; gap: 10px; }
    .verdict.pass { background: rgba(80, 200, 80, 0.12); border: 1px solid rgba(80, 200, 80, 0.3); }
    .verdict.fail { background: rgba(255, 80, 80, 0.12); border: 1px solid rgba(255, 80, 80, 0.3); }
    .verdict-icon { font-size: 1.4em; }

    /* Summary cards */
    .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .card { background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 6px; padding: 12px 18px; text-align: center; min-width: 100px; flex: 1; }
    .card .number { font-size: 1.8em; font-weight: bold; }
    .card .label { font-size: .8em; opacity: .7; }
    .card.new-card .number { color: var(--vscode-errorForeground, #f44); }
    .card.fixed-card .number { color: var(--vscode-charts-green, #89d185); }
    .card.files-card .number { color: var(--vscode-foreground); }

    /* File sections */
    .file-section { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 8px; overflow: hidden; }
    .file-section.has-new { border-left: 3px solid var(--vscode-errorForeground, #f44); }
    .file-section.has-fixed { border-left: 3px solid var(--vscode-charts-green, #89d185); }
    .file-section.clean { border-left: 3px solid var(--vscode-panel-border); }
    .file-header { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; background: var(--vscode-editor-inactiveSelectionBackground); user-select: none; }
    .file-header:hover { background: var(--vscode-list-hoverBackground); }
    .collapse-icon { font-size: .8em; transition: transform .15s; width: 12px; }
    .file-section.open .collapse-icon { transform: rotate(90deg); }
    .file-name { font-weight: 600; font-size: .9em; }
    .file-badge { padding: 2px 6px; border-radius: 4px; font-size: .7em; font-weight: bold; }
    .file-badge.added { background: rgba(80, 200, 80, 0.2); color: var(--vscode-charts-green, #89d185); }
    .file-badge.modified { background: rgba(220, 180, 50, 0.2); color: var(--vscode-editorWarning-foreground, #cca700); }
    .file-badge.renamed { background: rgba(100, 149, 237, 0.2); color: cornflowerblue; }
    .file-count { font-size: .8em; margin-left: auto; }
    .file-count.new-count { color: var(--vscode-errorForeground, #f44); }
    .file-count.fixed-count { color: var(--vscode-charts-green, #89d185); }
    .file-count.clean-count { opacity: .5; }
    .file-body { padding: 0; }

    /* Issue table */
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border); font-size: .85em; vertical-align: top; }
    tr.new { background: rgba(255, 80, 80, 0.06); }
    tr.fixed { background: rgba(80, 200, 80, 0.06); }
    .badge { padding: 2px 8px; border-radius: 8px; font-size: .7em; font-weight: bold; white-space: nowrap; }
    .new-badge { background: var(--vscode-errorForeground, #f44); color: #fff; }
    .fixed-badge { background: var(--vscode-charts-green, #89d185); color: #000; }
    .badge-cell { width: 55px; }
    .line-num { opacity: .6; font-size: .8em; white-space: nowrap; }
    .severity { font-size: .75em; text-transform: uppercase; font-weight: 600; }
    .severity.error { color: var(--vscode-errorForeground, #f44); }
    .severity.warning { color: var(--vscode-editorWarning-foreground, #cca700); }
    .severity.info { color: var(--vscode-editorInfo-foreground, #3794ff); }
    .severity.hint { opacity: .6; }
    code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-size: .85em; }
    .empty { opacity: .5; padding: 12px; font-size: .85em; }

    /* Rule summary */
    .rule-summary { margin-top: 20px; }
    .rule-summary table { max-width: 500px; }
    .rule-summary td { padding: 4px 10px; }
    .num { text-align: center; min-width: 40px; }

    .clickable { cursor: pointer; text-decoration: underline; text-decoration-style: dotted; }
    .clickable:hover { opacity: .8; }

    h2 { font-size: 1.05em; margin: 20px 0 10px; }

    /* GitHub PR header */
    .pr-header h1 { font-size: 1.3em; margin: 0 0 6px; }
    .pr-meta { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: .85em; opacity: .8; margin-bottom: 16px; }
    .pr-author { }
    .pr-branches code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-size: .9em; }
    .pr-link { color: var(--vscode-textLink-foreground); text-decoration: none; }
    .pr-link:hover { text-decoration: underline; }
    ${getCommandBarCss()}
  </style>
</head>
<body>
  ${getCommandBarHtml()}
  ${prHeader}

  <div class="verdict ${verdictClass}">
    <span class="verdict-icon">${verdictIcon}</span>
    <span>${verdictText}</span>
  </div>

  <div class="summary">
    <div class="card new-card">
      <div class="number">${r.totalNew}</div>
      <div class="label">New Issues</div>
    </div>
    <div class="card fixed-card">
      <div class="number">${r.totalFixed}</div>
      <div class="label">Fixed Issues</div>
    </div>
    <div class="card files-card">
      <div class="number">${r.files.length}</div>
      <div class="label">Files Changed</div>
    </div>
    <div class="card">
      <div class="number">${r.totalPrevious} → ${r.totalCurrent}</div>
      <div class="label">Total Issues</div>
    </div>
  </div>

  ${filesWithNewIssues.length > 0 ? `<h2>Files with New Issues (${filesWithNewIssues.length})</h2>` : ''}
  ${filesWithFixedIssues.length > 0 && filesWithNewIssues.length === 0 ? '<h2>Changed Files</h2>' : ''}

  ${fileSections}

  ${ruleMap.size > 0 ? `
  <div class="rule-summary">
    <h2>Rules Summary</h2>
    <table>
      <thead><tr><td><strong>Rule</strong></td><td class="num"><strong>New</strong></td><td class="num"><strong>Fixed</strong></td></tr></thead>
      <tbody>${ruleRows}</tbody>
    </table>
  </div>` : ''}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    ${getCommandBarJs()}

    // Collapse/expand file sections
    document.querySelectorAll('.file-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.parentElement;
        const body = section.querySelector('.file-body');
        const open = section.classList.toggle('open');
        body.style.display = open ? 'block' : 'none';
      });
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          header.click();
        }
      });
    });

    // Auto-expand files with new issues
    document.querySelectorAll('.file-section.has-new').forEach(section => {
      section.classList.add('open');
      section.querySelector('.file-body').style.display = 'block';
    });

    // Click to open file
    document.querySelectorAll('.clickable').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const file = el.dataset.file;
        const line = parseInt(el.dataset.line || '0', 10);
        if (file) {
          vscode.postMessage({ command: 'openFile', file, line });
        }
      });
    });
  </script>
</body>
</html>`;
}
