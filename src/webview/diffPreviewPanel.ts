import * as vscode from 'vscode';
import type { A11yChange, FullFileFixResult } from '../ai/fullFileFix';
import { updateDiagnostics } from '../diagnostics';
import { escapeHtml as esc, getNonce, getCommandBarCss, getCommandBarHtml, getCommandBarJs, ALLOWED_COMMANDS } from './utils';
import { getAxeMetadata, getWcagTags, getHelpUrl } from '../scanner/axeIntegration';
import { A11yReportPanel } from './reportPanel';
import { ScreenReaderPanel } from './screenReaderPanel';

/**
 * Webview panel that shows a before / after diff for each proposed change
 * and lets the user accept or reject individual changes.
 */
export class DiffPreviewPanel {
  public static currentPanel: DiffPreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly documentUri: vscode.Uri;
  private changes: A11yChange[];
  private designSystem: string | null;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    documentUri: vscode.Uri,
    result: FullFileFixResult,
  ) {
    this.panel = panel;
    this.documentUri = documentUri;
    this.changes = result.changes;
    this.designSystem = result.designSystemDetected;

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(
    documentUri: vscode.Uri,
    result: FullFileFixResult,
  ): void {
    const column = vscode.ViewColumn.Two;

    if (DiffPreviewPanel.currentPanel) {
      DiffPreviewPanel.currentPanel.panel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      'a11yDiffPreview',
      'Accessify Fix Preview',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    DiffPreviewPanel.currentPanel = new DiffPreviewPanel(panel, documentUri, result);
  }

  /* ── Message handling ──────────────────────────────────── */

  private async handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'applySelected': {
        const accepted: number[] = msg.accepted; // array of change ids
        await this.applyChanges(accepted);
        break;
      }
      case 'applyAll': {
        const allIds = this.changes.map(c => c.id);
        await this.applyChanges(allIds);
        break;
      }
      case 'dismiss': {
        this.panel.dispose();
        break;
      }
      case 'runCommand': {
        if (msg.command && ALLOWED_COMMANDS.has(msg.command)) { vscode.commands.executeCommand(msg.command); }
        break;
      }
    }
  }

  private async applyChanges(acceptedIds: number[]): Promise<void> {
    if (acceptedIds.length === 0) {
      vscode.window.showInformationMessage('Accessify: No changes selected.');
      return;
    }

    const accepted = this.changes
      .filter(c => acceptedIds.includes(c.id))
      .sort((a, b) => b.startLine - a.startLine); // apply bottom-up to preserve line numbers

    const document = await vscode.workspace.openTextDocument(this.documentUri);
    const edit = new vscode.WorkspaceEdit();
    let appliedCount = 0;
    let skippedCount = 0;
    const usedRanges: Array<{ start: number; end: number }> = [];

    for (const change of accepted) {
      const startLine = change.startLine - 1; // 0-based
      const endLine = Math.min(change.endLine - 1, document.lineCount - 1);

      // Skip changes that overlap with already-accepted ranges
      if (usedRanges.some(r => startLine <= r.end && endLine >= r.start)) {
        skippedCount++;
        continue;
      }

      const startPos = new vscode.Position(startLine, 0);
      const endPos = document.lineAt(endLine).range.end;
      const rangeToReplace = new vscode.Range(startPos, endPos);

      const currentText = document.getText(rangeToReplace);
      const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim();
      if (normalize(currentText) !== normalize(change.original)) {
        skippedCount++;
        continue;
      }

      edit.replace(this.documentUri, rangeToReplace, change.replacement);
      usedRanges.push({ start: startLine, end: endLine });
      appliedCount++;
    }

    if (appliedCount === 0) {
      vscode.window.showWarningMessage(
        'Accessify: No changes could be applied — the file may have been modified since the scan.',
      );
      return;
    }

    const success = await vscode.workspace.applyEdit(edit);
    if (success) {
      try {
        const doc = await vscode.workspace.openTextDocument(this.documentUri);
        await doc.save();
        await updateDiagnostics(doc);
      } catch {
      }

      try {
        await vscode.commands.executeCommand('editor.action.formatDocument', this.documentUri);
      } catch {
      }

      if (A11yReportPanel.currentPanel) {
        await A11yReportPanel.currentPanel.update();
      }
      if (ScreenReaderPanel.currentPanel) {
        ScreenReaderPanel.currentPanel.refresh();
      }

      let msg = `Accessify: Applied ${appliedCount} accessibility fix(es).`;
      if (skippedCount > 0) {
        msg += ` Skipped ${skippedCount} (source changed).`;
      }
      vscode.window.showInformationMessage(msg);
      this.panel.dispose();
    } else {
      vscode.window.showErrorMessage('Accessify: Failed to apply changes.');
    }
  }

  /* ── HTML builder ───────────────────────────────────────── */

  private buildHtml(): string {
    const nonce = getNonce();
    const changeCards = this.changes.map(c => this.buildChangeCard(c)).join('\n');
    const dsLabel = this.designSystem
      ? `<span class="ds-badge">${esc(this.designSystem)}</span>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Accessify Fix Preview</title>
  <style>
    :root {
      --card-bg: var(--vscode-editor-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --green: var(--vscode-charts-green, #89d185);
      --red: var(--vscode-charts-red, #f14c4c);
      --orange: var(--vscode-charts-orange, #cca700);
      --blue: var(--vscode-charts-blue, #6fc3df);
    }
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
           background: var(--vscode-editor-background); padding: 20px; margin: 0; line-height: 1.5; }
    h1 { font-size: 1.3em; margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
    h1::before { content: "\\1F527"; font-size: .9em; }
    .subtitle { opacity: .6; font-size: .85em; margin-bottom: 16px; }
    .ds-badge { background: var(--blue); color: #000; padding: 2px 8px; border-radius: 10px;
                font-size: .75em; font-weight: 600; }

    /* toolbar */
    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
    .toolbar button { padding: 6px 14px; border: 1px solid var(--border); border-radius: 4px;
      cursor: pointer; font-family: inherit; font-size: .85em;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground); transition: opacity .15s, background .15s; }
    .toolbar button:hover { opacity: .85; }
    .toolbar button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    .toolbar button.secondary { background: transparent; color: var(--vscode-foreground); }
    .toolbar .spacer { flex: 1; }

    /* change card */
    .change-card { border: 1px solid var(--border); border-radius: 6px; margin-bottom: 12px;
                   overflow: hidden; transition: border-color .2s, box-shadow .2s; }
    .change-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    .change-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px;
                     background: var(--card-bg); cursor: pointer; user-select: none; transition: background .15s; }
    .change-header:hover { background: var(--vscode-list-hoverBackground); }
    .change-header .checkbox { width: 18px; height: 18px; accent-color: var(--green); cursor: pointer; flex-shrink: 0; }
    .change-header .checkbox:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    .change-header .rule { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
                           padding: 1px 8px; border-radius: 8px; font-size: .78em; }
    .change-header .lines { opacity: .6; font-size: .82em; margin-left: auto; }
    .explanation { padding: 6px 12px 8px; font-size: .85em; opacity: .8; border-bottom: 1px solid var(--border); }

    /* diff view */
    .diff { display: grid; grid-template-columns: 1fr 1fr; font-family: var(--vscode-editor-font-family, monospace);
            font-size: .82em; line-height: 1.5; }
    .diff-label { padding: 4px 12px; font-weight: 600; font-size: .78em; text-transform: uppercase; opacity: .6;
                  border-bottom: 1px solid var(--border); }
    .diff-label.before { border-right: 1px solid var(--border); }
    .diff-code { padding: 8px 12px; white-space: pre-wrap; word-break: break-word; overflow-x: auto; }
    .diff-code.before { background: rgba(255,80,80,0.06); border-right: 1px solid var(--border); }
    .diff-code.after  { background: rgba(80,200,80,0.06); }

    /* accepted / rejected badges */
    .change-card.accepted { border-color: var(--green); }
    .change-card.rejected { opacity: .5; border-color: var(--border); }

    .count { font-size: .85em; opacity: .7; padding: 0 4px; white-space: nowrap; }

    /* reasoning section */
    .reasoning { padding: 4px 12px 8px; font-size: .82em; opacity: .75; border-bottom: 1px solid var(--border); font-style: italic; }
    .axe-meta { padding: 4px 12px 6px; font-size: .78em; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
    .axe-meta .wcag-tag { background: var(--blue); color: #000; padding: 1px 6px; border-radius: 8px; font-size: .85em; }
    .axe-meta .impact-tag { padding: 1px 6px; border-radius: 8px; font-size: .85em; font-weight: 600; }
    .axe-meta .impact-critical { background: var(--red); color: #fff; }
    .axe-meta .impact-serious { background: var(--orange); color: #000; }
    .axe-meta .impact-moderate { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .axe-meta .impact-minor { opacity: .7; background: var(--border); }
    .axe-meta a { color: var(--blue); text-decoration: none; font-size: .85em; }
    .axe-meta a:hover { text-decoration: underline; }
    .confidence { padding: 1px 8px; border-radius: 8px; font-size: .78em; font-weight: 600; margin-left: 4px; }
    .confidence-high { background: var(--green); color: #000; }
    .confidence-medium { background: var(--orange); color: #000; }
    .confidence-low { background: var(--red); color: #fff; }
    ${getCommandBarCss()}
  </style>
</head>
<body>
  ${getCommandBarHtml()}
  <h1>Accessify Fix Preview ${dsLabel}</h1>
  <div class="subtitle">${this.changes.length} proposed change(s) for ${esc(vscode.workspace.asRelativePath(this.documentUri))}</div>

  <div class="toolbar">
    <button id="selectAll">Select All</button>
    <button id="deselectAll" class="secondary">Deselect All</button>
    <span class="spacer"></span>
    <span id="selCount" class="count">0 selected</span>
    <button id="applySelected">Apply Selected</button>
    <button id="dismiss" class="secondary">Dismiss</button>
  </div>

  <div id="changes">${changeCards}</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    ${getCommandBarJs()}
    const cards = document.querySelectorAll('.change-card');
    const countEl = document.getElementById('selCount');

    function updateCount() {
      const checked = document.querySelectorAll('.change-checkbox:checked').length;
      countEl.textContent = checked + ' selected';
    }

    // Toggle checkbox when clicking the card header
    cards.forEach(card => {
      const header = card.querySelector('.change-header');
      const cb = card.querySelector('.change-checkbox');
      header.addEventListener('click', (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        card.classList.toggle('accepted', cb.checked);
        card.classList.toggle('rejected', !cb.checked);
        updateCount();
      });
      cb.addEventListener('change', () => {
        card.classList.toggle('accepted', cb.checked);
        card.classList.toggle('rejected', !cb.checked);
        updateCount();
      });
    });

    document.getElementById('selectAll').addEventListener('click', () => {
      document.querySelectorAll('.change-checkbox').forEach(cb => { cb.checked = true; });
      cards.forEach(c => { c.classList.add('accepted'); c.classList.remove('rejected'); });
      updateCount();
    });

    document.getElementById('deselectAll').addEventListener('click', () => {
      document.querySelectorAll('.change-checkbox').forEach(cb => { cb.checked = false; });
      cards.forEach(c => { c.classList.remove('accepted'); c.classList.add('rejected'); });
      updateCount();
    });

    document.getElementById('applySelected').addEventListener('click', () => {
      const accepted = [];
      document.querySelectorAll('.change-checkbox:checked').forEach(cb => {
        accepted.push(Number(cb.dataset.id));
      });
      vscode.postMessage({ type: 'applySelected', accepted });
    });

    document.getElementById('dismiss').addEventListener('click', () => {
      vscode.postMessage({ type: 'dismiss' });
    });

    // Default: all selected
    document.querySelectorAll('.change-checkbox').forEach(cb => { cb.checked = true; });
    cards.forEach(c => c.classList.add('accepted'));
    updateCount();
  </script>
</body>
</html>`;
  }

  private buildChangeCard(change: A11yChange): string {
    // Reasoning section
    const reasoningHtml = change.reasoning
      ? `<div class="reasoning">${esc(change.reasoning)}</div>`
      : '';

    // axe-core metadata section
    const axeMeta = getAxeMetadata(change.rule);
    const wcagTags = getWcagTags(change.rule);
    const helpUrl = getHelpUrl(change.rule);

    let axeHtml = '';
    if (axeMeta || wcagTags.length > 0) {
      const parts: string[] = [];
      if (axeMeta) {
        const impactClass = `impact-${axeMeta.impact}`;
        parts.push(`<span class="impact-tag ${impactClass}">${esc(axeMeta.impact)}</span>`);
      }
      for (const tag of wcagTags) {
        parts.push(`<span class="wcag-tag">${esc(tag)}</span>`);
      }
      if (helpUrl) {
        parts.push(`<a href="${esc(helpUrl)}" title="axe-core documentation">Learn more &#8599;</a>`);
      }
      axeHtml = `<div class="axe-meta">${parts.join('')}</div>`;
    }

    return `
    <div class="change-card" data-id="${change.id}">
      <div class="change-header">
        <input type="checkbox" class="checkbox change-checkbox" data-id="${change.id}" id="change-cb-${change.id}" checked aria-label="${esc(change.explanation)}" />
        <label for="change-cb-${change.id}"><strong>${esc(change.explanation)}</strong></label>
        <span class="rule">${esc(change.rule)}</span>        ${this.buildConfidenceBadge(change.confidence)}        <span class="lines">Lines ${change.startLine}–${change.endLine}</span>
      </div>
      ${axeHtml}
      ${reasoningHtml}
      <div class="diff">
        <div class="diff-label before">Before</div>
        <div class="diff-label">After</div>
        <div class="diff-code before">${esc(change.original)}</div>
        <div class="diff-code after">${esc(change.replacement)}</div>
      </div>
    </div>`;
  }

  private buildConfidenceBadge(confidence: number): string {
    if (confidence >= 75) {
      return `<span class="confidence confidence-high">${confidence}%</span>`;
    } else if (confidence >= 50) {
      return `<span class="confidence confidence-medium">${confidence}%</span>`;
    }
    return `<span class="confidence confidence-low">${confidence}%</span>`;
  }

  private dispose(): void {
    DiffPreviewPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

