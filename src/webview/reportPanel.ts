import * as vscode from 'vscode';
import { scanForA11yIssues } from '../scanner/astScanner';
import type { A11yIssue } from '../types';
import { escapeHtml, getNonce, getCommandBarCss, getCommandBarHtml, getCommandBarJs, ALLOWED_COMMANDS } from './utils';

/**
 * Generates an HTML report of accessibility issues across the workspace.
 */
export class A11yReportPanel {
  public static currentPanel: A11yReportPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.webview.html = this.getLoadingHtml();
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async handleMessage(msg: any): Promise<void> {
    if (msg.type === 'runCommand' && msg.command && ALLOWED_COMMANDS.has(msg.command)) {
      vscode.commands.executeCommand(msg.command);
      return;
    }
    if (msg.type === 'openFile' && msg.uri) {
      try {
        const uri = vscode.Uri.parse(msg.uri);
        if (uri.scheme !== 'file' || !vscode.workspace.getWorkspaceFolder(uri)) { return; }
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        if (typeof msg.line === 'number' && msg.line > 0) {
          const line = Math.min(msg.line - 1, doc.lineCount - 1);
          const range = new vscode.Range(line, 0, line, 0);
          editor.selection = new vscode.Selection(range.start, range.start);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
      } catch { /* file may no longer exist */ }
    }
  }

  private getLoadingHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); display: flex; flex-direction: column; align-items: center; justify-content: center; height: 90vh; }
  .progress-container { width: 300px; text-align: center; }
  .progress-bar-track { width: 100%; height: 6px; background: var(--vscode-editorWidget-background, #333); border-radius: 3px; margin: 16px 0 12px; overflow: hidden; }
  .progress-bar-fill { height: 100%; width: 0%; background: var(--vscode-progressBar-background, #0e70c0); border-radius: 3px; transition: width 0.2s ease; }
  .progress-label { font-size: 0.9em; opacity: 0.8; }
  .progress-file { font-size: 0.8em; opacity: 0.5; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
</style>
</head><body>
  <div class="progress-container">
    <p class="progress-label">Scanning workspace\u2026</p>
    <div class="progress-bar-track"><div class="progress-bar-fill" id="progressBar"></div></div>
    <p class="progress-file" id="progressFile"></p>
  </div>
  <script nonce="${nonce}">
    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'scanProgress') {
        var pct = Math.round((msg.current / msg.total) * 100);
        document.getElementById('progressBar').style.width = pct + '%';
        document.querySelector('.progress-label').textContent = 'Scanning workspace\u2026 ' + msg.current + '/' + msg.total;
        document.getElementById('progressFile').textContent = msg.file || '';
      }
    });
  </script>
</body></html>`;
  }

  public static async createOrShow(_context: vscode.ExtensionContext, fileUri?: vscode.Uri): Promise<void> {
    const column = vscode.ViewColumn.Beside;

    if (A11yReportPanel.currentPanel) {
      A11yReportPanel.currentPanel.panel.reveal(column);
      if (fileUri) {
        await A11yReportPanel.currentPanel.updateForFile(fileUri);
      } else {
        await A11yReportPanel.currentPanel.update();
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'a11yReport',
      'Accessify Report',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    A11yReportPanel.currentPanel = new A11yReportPanel(panel);
    if (fileUri) {
      await A11yReportPanel.currentPanel.updateForFile(fileUri);
    } else {
      await A11yReportPanel.currentPanel.update();
    }
  }

  public async updateForFile(fileUri: vscode.Uri): Promise<void> {
    const issuesByFile: { file: string; uri: string; issues: { message: string; rule: string; severity: string; line: number }[] }[] = [];
    let totalIssues = 0;
    const ruleCount: Record<string, number> = {};

    const document = await vscode.workspace.openTextDocument(fileUri);
    const issues = scanForA11yIssues(document.getText(), document.fileName);
    const relativePath = vscode.workspace.asRelativePath(fileUri);

    if (issues.length > 0) {
      issuesByFile.push({
        file: relativePath,
        uri: fileUri.toString(),
        issues: issues.map((i: A11yIssue) => ({ message: i.message, rule: i.rule, severity: i.severity, line: i.line + 1 })),
      });
      totalIssues += issues.length;
      issues.forEach((i: A11yIssue) => {
        ruleCount[i.rule] = (ruleCount[i.rule] || 0) + 1;
      });
    }

    this.panel.title = `Accessify Report — ${relativePath}`;
    this.panel.webview.html = this.getHtml(issuesByFile, totalIssues, ruleCount, 1);
  }

  public async update(): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.{tsx,jsx}', '**/node_modules/**');

    const issuesByFile: { file: string; uri: string; issues: { message: string; rule: string; severity: string; line: number }[] }[] = [];
    let totalIssues = 0;
    const ruleCount: Record<string, number> = {};
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const fileUri = files[i];
      const relativePath = vscode.workspace.asRelativePath(fileUri);

      this.panel.webview.postMessage({
        type: 'scanProgress',
        current: i + 1,
        total,
        file: relativePath,
      });

      const document = await vscode.workspace.openTextDocument(fileUri);
      const issues = scanForA11yIssues(document.getText(), document.fileName);

      if (issues.length > 0) {
        issuesByFile.push({
          file: relativePath,
          uri: fileUri.toString(),
          issues: issues.map((i: A11yIssue) => ({ message: i.message, rule: i.rule, severity: i.severity, line: i.line + 1 })),
        });
        totalIssues += issues.length;
        issues.forEach((i: A11yIssue) => {
          ruleCount[i.rule] = (ruleCount[i.rule] || 0) + 1;
        });
      }
    }

    this.panel.webview.html = this.getHtml(issuesByFile, totalIssues, ruleCount, total);
  }

  private getHtml(
    issuesByFile: { file: string; uri: string; issues: { message: string; rule: string; severity: string; line: number }[] }[],
    totalIssues: number,
    ruleCount: Record<string, number>,
    totalFiles: number,
  ): string {
    const sortedRules = Object.entries(ruleCount).sort((a, b) => b[1] - a[1]);

    // Compute workspace accessibility score
    const workspaceScore = this.computeWorkspaceScore(issuesByFile, totalFiles);

    const fileRows = issuesByFile
      .sort((a, b) => b.issues.length - a.issues.length)
      .map(f => {
        const issueRows = f.issues.map(i => `
          <tr class="issue-row" data-uri="${escapeHtml(f.uri)}" data-line="${i.line}">
            <td class="severity-cell"><span class="severity ${i.severity}">${i.severity.toUpperCase()}</span></td>
            <td class="line-cell">Line ${i.line}</td>
            <td>${escapeHtml(i.message)}</td>
            <td><code>${i.rule}</code></td>
          </tr>
        `).join('');

        return `
          <div class="file-section">
            <div class="file-header" data-toggle="collapse">
              <span class="chevron">&#9660;</span>
              <strong title="${escapeHtml(f.file)}" class="file-name" data-uri="${escapeHtml(f.uri)}">${escapeHtml(f.file)}</strong>
              <span class="badge">${f.issues.length}</span>
            </div>
            <table class="issues-table">
              <tbody>${issueRows}</tbody>
            </table>
          </div>
        `;
      }).join('');

    const ruleRows = sortedRules.map(([rule, count]) => `
      <tr><td><code>${rule}</code></td><td>${count}</td></tr>
    `).join('');

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Accessify Report</title>
  <style>
    :root {
      --card-bg: var(--vscode-editor-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --green: var(--vscode-charts-green, #89d185);
      --red: var(--vscode-charts-red, #f14c4c);
      --orange: var(--vscode-charts-orange, #cca700);
      --blue: var(--vscode-charts-blue, #6fc3df);
      --radius: 6px;
    }
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; margin: 0; overflow-x: hidden; line-height: 1.5; }
    h1 { font-size: 1.3em; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
    h1::before { content: "\\1F50D"; font-size: .9em; }
    h2 { font-size: 1.05em; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: .5px; opacity: .7; font-weight: 600; }
    .subtitle { opacity: .6; font-size: .85em; margin-bottom: 16px; }

    /* summary cards */
    .summary { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .summary-item { text-align: center; min-width: 80px; flex: 1; padding: 14px 12px; background: var(--card-bg); border-radius: var(--radius); border: 1px solid var(--border); transition: transform .15s, box-shadow .15s; }
    .summary-item:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.15); }
    .summary-item .number { font-size: 1.8em; font-weight: bold; }
    .summary-item .label { font-size: .78em; opacity: .6; margin-top: 4px; text-transform: uppercase; letter-spacing: .3px; }
    .summary-item.error .number { color: var(--red); }
    .summary-item.warn .number { color: var(--orange); }
    .summary-item.ok .number { color: var(--green); }

    /* rule table */
    .rule-table { width: 100%; max-width: 480px; border-collapse: collapse; margin-bottom: 20px; }
    .rule-table tr { transition: background .15s; }
    .rule-table tr:hover { background: var(--card-bg); }
    .rule-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .rule-table td:last-child { text-align: right; font-weight: 700; min-width: 50px; font-variant-numeric: tabular-nums; }
    code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-size: .85em; font-family: var(--vscode-editor-font-family, monospace); }

    /* file sections */
    .file-section { margin-bottom: 8px; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; transition: border-color .15s; }
    .file-section:hover { border-color: var(--blue); }
    .file-section.collapsed .issues-table { display: none; }
    .file-section.collapsed .chevron { transform: rotate(-90deg); }
    .file-header { padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; background: var(--vscode-sideBar-background, var(--card-bg)); user-select: none; transition: background .15s; }
    .file-header:hover { background: var(--vscode-list-hoverBackground); }
    .file-header strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9em; }
    .file-header strong.file-name { cursor: pointer; }
    .file-header strong.file-name:hover { text-decoration: underline; color: var(--vscode-textLink-foreground); }
    .chevron { display: inline-block; transition: transform .2s ease; font-size: .7em; flex-shrink: 0; }
    .badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 10px; font-size: .78em; flex-shrink: 0; font-weight: 600; }

    /* issue rows */
    .issues-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .issue-row { transition: background .15s; cursor: pointer; }
    .issue-row:hover { background: var(--card-bg); }
    .issue-row td { padding: 8px 12px; border-top: 1px solid var(--border); font-size: .85em; vertical-align: middle; word-wrap: break-word; overflow-wrap: break-word; }
    .line-cell { color: var(--vscode-textLink-foreground); }
    .issue-row:hover .line-cell { text-decoration: underline; }
    .severity-cell { width: 100px; text-align: center; vertical-align: middle; }
    .issue-row td:nth-child(2) { width: 70px; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle; }
    .issue-row td:nth-child(4) { width: 140px; vertical-align: middle; }
    .severity { font-weight: 700; font-size: .75em; text-transform: uppercase; letter-spacing: .5px; padding: 4px 10px; border-radius: 10px; display: inline-block; white-space: nowrap; line-height: 1; }
    .severity.error { color: #fff; background: var(--red); }
    .severity.warning { color: #000; background: var(--orange); }
    .severity.info { color: #000; background: var(--blue); }
    .severity.hint { color: #000; background: var(--green); }

    /* empty state */
    .empty { text-align: center; padding: 40px 20px; opacity: .5; font-size: .9em; }

    /* workspace score gauge */
    .score-card { text-align: center; min-width: 100px; flex: 1.2; padding: 16px 12px; background: var(--card-bg); border-radius: var(--radius); border: 1px solid var(--border); transition: transform .15s, box-shadow .15s; }
    .score-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.15); }
    .score-card .score-value { font-size: 2.2em; font-weight: bold; }
    .score-card .score-label { font-size: .78em; opacity: .6; margin-top: 2px; text-transform: uppercase; letter-spacing: .3px; }
    .score-card .score-bar { width: 100%; height: 6px; background: var(--border); border-radius: 3px; margin-top: 8px; overflow: hidden; }
    .score-card .score-fill { height: 100%; border-radius: 3px; transition: width .3s ease; }
    .score-card.score-high .score-value { color: var(--green); }
    .score-card.score-high .score-fill { background: var(--green); }
    .score-card.score-mid .score-value { color: var(--orange); }
    .score-card.score-mid .score-fill { background: var(--orange); }
    .score-card.score-low .score-value { color: var(--red); }
    .score-card.score-low .score-fill { background: var(--red); }
    ${getCommandBarCss()}
  </style>
</head>
<body>
  ${getCommandBarHtml()}
  <h1>Accessibility Report</h1>
  <p class="subtitle">${totalFiles} files scanned &middot; ${issuesByFile.length} with issues</p>

  <div class="summary">
    <div class="summary-item ${totalIssues > 0 ? 'error' : 'ok'}">
      <div class="number">${totalIssues}</div>
      <div class="label">Total Issues</div>
    </div>
    <div class="summary-item ${issuesByFile.length > 0 ? 'warn' : 'ok'}">
      <div class="number">${issuesByFile.length}</div>
      <div class="label">Affected Files</div>
    </div>
    <div class="summary-item">
      <div class="number">${totalFiles}</div>
      <div class="label">Files Scanned</div>
    </div>
    <div class="summary-item">
      <div class="number">${sortedRules.length}</div>
      <div class="label">Rule Types</div>
    </div>
    ${totalFiles > 1 ? `<div class="score-card ${workspaceScore >= 80 ? 'score-high' : workspaceScore >= 50 ? 'score-mid' : 'score-low'}">
      <div class="score-value">${workspaceScore}/100</div>
      <div class="score-label">Workspace Score</div>
      <div class="score-bar"><div class="score-fill" style="width:${workspaceScore}%"></div></div>
    </div>` : ''}
  </div>

  <h2>Issues by Rule</h2>
  <table class="rule-table">
    <tbody>${ruleRows}</tbody>
  </table>

  <h2>Issues by File</h2>
  ${fileRows || '<div class="empty">&#10003; No accessibility issues found &mdash; nice work!</div>'}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    ${getCommandBarJs()}

    document.querySelectorAll('[data-toggle="collapse"]').forEach(function(el) {
      el.addEventListener('click', function() {
        this.parentElement.classList.toggle('collapsed');
      });
    });

    document.querySelectorAll('.file-name').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'openFile', uri: el.dataset.uri });
      });
    });

    document.querySelectorAll('.issue-row').forEach(function(row) {
      row.addEventListener('click', function(e) {
        e.stopPropagation();
        var uri = row.getAttribute('data-uri');
        var line = parseInt(row.getAttribute('data-line'), 10);
        if (uri) {
          vscode.postMessage({ type: 'openFile', uri: uri, line: line });
        }
      });
    });
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    A11yReportPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }

  /**
   * WCAG-principled workspace accessibility score.
   *
   * Maps each rule to its WCAG conformance level (A, AA, AAA) and principle.
   * Penalties are weighted by conformance level — Level A violations (baseline
   * accessibility) cost the most because they block access entirely. The score
   * combines three components:
   *
   *   1. **Coverage (35%)** — fraction of scanned files that are clean.
   *   2. **Weighted severity (40%)** — per-file penalty based on WCAG level ×
   *      diagnostic severity, normalised across all scanned files.
   *   3. **Principle breadth (25%)** — penalises when violations span multiple
   *      WCAG principles (Perceivable / Operable / Understandable / Robust),
   *      indicating systemic accessibility gaps.
   */
  private computeWorkspaceScore(
    issuesByFile: { issues: { severity: string; rule?: string }[] }[],
    totalFiles: number,
  ): number {
    if (totalFiles === 0) { return 100; }

    const affectedFiles = issuesByFile.length;
    if (affectedFiles === 0) { return 100; }

    // WCAG conformance-level weights — Level A is most critical
    const levelWeight: Record<string, number> = { 'A': 3, 'AA': 2, 'AAA': 1 };

    // Map rules → { WCAG level, principle }
    const wcagRuleMeta: Record<string, { level: string; principle: string }> = {
      'img-alt':                        { level: 'A',  principle: 'Perceivable' },
      'button-label':                   { level: 'A',  principle: 'Robust' },
      'aria-role':                       { level: 'A',  principle: 'Robust' },
      'form-label':                      { level: 'A',  principle: 'Perceivable' },
      'click-events-have-key-events':    { level: 'A',  principle: 'Operable' },
      'aria-pattern':                    { level: 'A',  principle: 'Robust' },
      'color-contrast':                  { level: 'AA', principle: 'Perceivable' },
      'heading-order':                   { level: 'A',  principle: 'Perceivable' },
      'autocomplete-valid':              { level: 'AA', principle: 'Perceivable' },
      'no-positive-tabindex':            { level: 'A',  principle: 'Operable' },
      'focus-visible':                   { level: 'AA', principle: 'Operable' },
      'page-title':                      { level: 'A',  principle: 'Operable' },
      'no-mouse-only-hover':             { level: 'AA', principle: 'Perceivable' },
      'nextjs-head-lang':                { level: 'A',  principle: 'Understandable' },
      'nextjs-image-alt':                { level: 'A',  principle: 'Perceivable' },
      'nextjs-link-text':                { level: 'A',  principle: 'Perceivable' },
      'no-access-key':                   { level: 'A',  principle: 'Operable' },
      'no-autofocus':                    { level: 'A',  principle: 'Operable' },
      'no-redundant-roles':              { level: 'A',  principle: 'Robust' },
      'media-has-caption':               { level: 'A',  principle: 'Perceivable' },
      'interactive-supports-focus':       { level: 'A',  principle: 'Operable' },
      'anchor-is-valid':                 { level: 'A',  principle: 'Operable' },
      'prefer-semantic-elements':          { level: 'A',  principle: 'Perceivable' },
      'no-noninteractive-element-interactions': { level: 'A', principle: 'Robust' },
    };

    const severityMultiplier: Record<string, number> = {
      'error': 2.0,
      'warning': 1.0,
      'info': 0.4,
      'hint': 0.2,
    };

    let totalPenalty = 0;
    const violatedPrinciples = new Set<string>();

    for (const file of issuesByFile) {
      for (const issue of file.issues) {
        const meta = wcagRuleMeta[issue.rule ?? ''];
        const lw = meta ? (levelWeight[meta.level] ?? 2) : 2;
        const sm = severityMultiplier[issue.severity] ?? 1;
        totalPenalty += lw * sm;
        if (meta) { violatedPrinciples.add(meta.principle); }
      }
    }

    // 1. Coverage score — fraction of clean files
    const coverageScore = ((totalFiles - affectedFiles) / totalFiles) * 100;

    // 2. Weighted severity score — penalty normalised per scanned file
    const avgPenaltyPerFile = totalPenalty / totalFiles;
    const severityScore = Math.max(0, 100 - avgPenaltyPerFile * 5);

    // 3. Principle breadth — 4 WCAG principles; each violated one costs 25pts
    const principleScore = Math.max(0, 100 - violatedPrinciples.size * 25);

    const raw = coverageScore * 0.35 + severityScore * 0.40 + principleScore * 0.25;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
}
