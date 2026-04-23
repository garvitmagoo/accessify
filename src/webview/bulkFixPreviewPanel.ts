import * as vscode from 'vscode';
import type { A11yChange } from '../ai/fullFileFix';
import { updateDiagnostics } from '../diagnostics';
import { A11yReportPanel } from './reportPanel';
import { ScreenReaderPanel } from './screenReaderPanel';
import { escapeHtml as esc, getNonce, getCommandBarCss, getCommandBarHtml, getCommandBarJs, ALLOWED_COMMANDS } from './utils';
import { getAxeMetadata, getWcagTags, getHelpUrl } from '../scanner/axeIntegration';

/** A bulk fix change grouped by file. */
export interface BulkFixFileEntry {
  uri: vscode.Uri;
  relativePath: string;
  changes: A11yChange[];
}

export interface BulkFixResult {
  files: BulkFixFileEntry[];
}

/**
 * Webview panel that previews bulk-fix changes across one or more files,
 * letting the user accept/reject individual changes before applying.
 */
export class BulkFixPreviewPanel {
  public static currentPanel: BulkFixPreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private result: BulkFixResult;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, result: BulkFixResult) {
    this.panel = panel;
    this.result = result;

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(result: BulkFixResult): void {
    const column = vscode.ViewColumn.Two;

    if (BulkFixPreviewPanel.currentPanel) {
      BulkFixPreviewPanel.currentPanel.panel.dispose();
    }

    const totalChanges = result.files.reduce((sum, f) => sum + f.changes.length, 0);
    const panel = vscode.window.createWebviewPanel(
      'a11yBulkFixPreview',
      `A11y Bulk Fix (${totalChanges} changes)`,
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    BulkFixPreviewPanel.currentPanel = new BulkFixPreviewPanel(panel, result);
  }

  /* ── Message handling ──────────────────────────────── */

  private async handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'applySelected': {
        const accepted: string[] = msg.accepted; // "fileIdx-changeId"
        await this.applyChangesWithConfirmation(accepted);
        break;
      }
      case 'applyAll': {
        const allKeys: string[] = [];
        this.result.files.forEach((f, fi) => {
          f.changes.forEach(c => allKeys.push(`${fi}-${c.id}`));
        });
        await this.applyChangesWithConfirmation(allKeys);
        break;
      }
      case 'dismiss':
        this.panel.dispose();
        break;
      case 'openFile': {
        if (msg.uri) {
          try {
            const uri = vscode.Uri.parse(msg.uri);
            if (uri.scheme !== 'file' || !vscode.workspace.getWorkspaceFolder(uri)) { break; }
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            if (typeof msg.line === 'number' && msg.line > 0) {
              const pos = new vscode.Position(msg.line - 1, 0);
              editor.selection = new vscode.Selection(pos, pos);
              editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            }
          } catch { /* file may no longer exist */ }
        }
        break;
      }
      case 'runCommand': {
        if (msg.command && ALLOWED_COMMANDS.has(msg.command)) { vscode.commands.executeCommand(msg.command); }
        break;
      }
    }
  }

  private async applyChangesWithConfirmation(acceptedKeys: string[]): Promise<void> {
    if (acceptedKeys.length === 0) {
      vscode.window.showInformationMessage('Accessify: No changes selected.');
      return;
    }

    let placeholderCount = 0;

    for (const key of acceptedKeys) {
      const [fi, cid] = key.split('-').map(Number);
      const entry = this.result.files[fi];
      const change = entry?.changes.find(c => c.id === cid);
      if (change) {
        if (change.replacement.includes('aria-label=""') ||
            change.replacement.includes('alt=""') ||
            change.replacement.includes('aria-controls=""') ||
            change.replacement.includes('autoComplete="name"') ||
            change.replacement.includes('/* handler */')) {
          placeholderCount++;
        }
      }
    }

    if (placeholderCount > 0) {
      const choice = await vscode.window.showWarningMessage(
        `Accessify: ${placeholderCount} change(s) insert placeholder values that need manual editing. Apply anyway?`,
        { modal: true },
        'Apply All Selected',
      );

      if (!choice) { return; }
    }

    return this.applyChanges(acceptedKeys);
  }

  private async applyChanges(acceptedKeys: string[]): Promise<void> {
    if (acceptedKeys.length === 0) {
      vscode.window.showInformationMessage('Accessify: No changes selected.');
      return;
    }

    // Group accepted changes by file index
    const groupedByFile = new Map<number, number[]>();
    for (const key of acceptedKeys) {
      const [fi, cid] = key.split('-').map(Number);
      if (!groupedByFile.has(fi)) { groupedByFile.set(fi, []); }
      groupedByFile.get(fi)!.push(cid);
    }

    const edit = new vscode.WorkspaceEdit();
    let appliedCount = 0;
    const skippedDetails: string[] = [];

    for (const [fileIdx, changeIds] of groupedByFile) {
      const entry = this.result.files[fileIdx];
      const document = await vscode.workspace.openTextDocument(entry.uri);
      const usedRanges: Array<{ start: number; end: number }> = [];

      const accepted = entry.changes
        .filter(c => changeIds.includes(c.id))
        .sort((a, b) => b.startLine - a.startLine); // bottom-up

      for (const change of accepted) {
        const startLine = change.startLine - 1;
        const endLine = Math.min(change.endLine - 1, document.lineCount - 1);

        // Skip changes that overlap with already-accepted ranges
        if (usedRanges.some(r => startLine <= r.end && endLine >= r.start)) {
          skippedDetails.push(`${entry.relativePath}:${change.startLine} [${change.rule}] — overlapping range`);
          continue;
        }

        const startPos = new vscode.Position(startLine, 0);
        const endPos = document.lineAt(endLine).range.end;
        const rangeToReplace = new vscode.Range(startPos, endPos);

        const currentText = document.getText(rangeToReplace);
        const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim();
        if (normalize(currentText) !== normalize(change.original)) {
          skippedDetails.push(`${entry.relativePath}:${change.startLine} [${change.rule}] — source changed`);
          continue;
        }

        edit.replace(entry.uri, rangeToReplace, change.replacement);
        usedRanges.push({ start: startLine, end: endLine });
        appliedCount++;
      }
    }

    if (appliedCount === 0) {
      const detail = skippedDetails.length > 0
        ? `Skipped:\n${skippedDetails.join('\n')}`
        : 'Files may have been modified.';
      vscode.window.showWarningMessage(
        `Accessify: No changes could be applied. ${detail}`,
      );
      return;
    }

    const success = await vscode.workspace.applyEdit(edit);
    if (success) {
      let msg = `Accessify: Applied ${appliedCount} fix(es) across ${groupedByFile.size} file(s).`;
      if (skippedDetails.length > 0) {
        msg += ` Skipped ${skippedDetails.length} (source changed).`;
        // Show detailed skip info in the output channel
        const channel = vscode.window.createOutputChannel('Accessify');
        channel.appendLine(`--- Bulk Fix: ${skippedDetails.length} change(s) skipped ---`);
        for (const detail of skippedDetails) {
          channel.appendLine(`  ${detail}`);
        }
        channel.appendLine('---');
        channel.show(true);
      }
      vscode.window.showInformationMessage(msg);

      // Save and re-scan diagnostics for all affected files
      for (const [fileIdx] of groupedByFile) {
        const entry = this.result.files[fileIdx];
        try {
          const doc = await vscode.workspace.openTextDocument(entry.uri);
          await doc.save();
          await updateDiagnostics(doc);
        } catch { /* file may have been closed */ }
      }

      if (A11yReportPanel.currentPanel) {
        await A11yReportPanel.currentPanel.update();
      }
      if (ScreenReaderPanel.currentPanel) {
        ScreenReaderPanel.currentPanel.refresh();
      }

      this.panel.dispose();
    } else {
      vscode.window.showErrorMessage('Accessify: Failed to apply changes.');
    }
  }

  /* ── HTML builder ──────────────────────────────────── */

  private buildHtml(): string {
    const nonce = getNonce();
    const allChanges = this.result.files.flatMap(f => f.changes);
    const totalChanges = allChanges.length;
    const totalFiles = this.result.files.length;

    const placeholders = allChanges.filter(c =>
      c.replacement.includes('aria-label=""') ||
      c.replacement.includes('alt=""') ||
      c.replacement.includes('aria-controls=""') ||
      c.replacement.includes('autoComplete="name"') ||
      c.replacement.includes('/* handler */')
    ).length;

    const fileSections = this.buildFolderGroupedSections();

    // Risk summary banner
    const riskBanner = placeholders > 0
      ? `<div class="risk-banner warn">
          <span class="risk-icon">&#9888;</span>
          <div class="risk-text">
            <strong>${placeholders} fix${placeholders !== 1 ? 'es' : ''}</strong> insert placeholder values (e.g. empty aria-label) that require manual editing.
          </div>
        </div>`
      : `<div class="risk-banner ok">
          <span class="risk-icon">&#10003;</span>
          <div class="risk-text">All fixes are ready to apply. Review diffs before applying.</div>
        </div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>A11y Bulk Fix Preview</title>
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
    h1 { font-size: 1.3em; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
    h1::before { content: "\\1F6E0"; font-size: .9em; }
    .subtitle { opacity: .6; font-size: .85em; margin-bottom: 12px; }

    /* risk banner */
    .risk-banner { display: flex; gap: 10px; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; align-items: flex-start; font-size: .88em; }
    .risk-banner.warn { background: rgba(204, 167, 0, 0.1); border: 1px solid var(--orange); }
    .risk-banner.ok { background: rgba(137, 209, 133, 0.08); border: 1px solid var(--green); }
    .risk-icon { font-size: 1.3em; flex-shrink: 0; }
    .risk-text { line-height: 1.5; }

    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
    .toolbar button { padding: 6px 14px; border: 1px solid var(--border); border-radius: 4px;
      cursor: pointer; font-family: inherit; font-size: .85em;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground); transition: opacity .15s; }
    .toolbar button:hover { opacity: .85; }
    .toolbar button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    .toolbar button.secondary { background: transparent; color: var(--vscode-foreground); }
    .toolbar .spacer { flex: 1; }
    .count { font-size: .85em; opacity: .7; line-height: 1; }

    /* file section */
    .file-section { margin-bottom: 16px; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; transition: border-color .15s; }
    .file-section:hover { border-color: var(--blue); }
    .file-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px;
                   background: var(--vscode-sideBar-background, var(--card-bg));
                   cursor: pointer; user-select: none; font-weight: 600; font-size: .95em; transition: background .15s; }
    .file-header:hover { background: var(--vscode-list-hoverBackground); }
    .file-header .file-checkbox { width: 18px; height: 18px; accent-color: var(--green); cursor: pointer; flex-shrink: 0; }
    .file-header .file-checkbox:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    .file-header .file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; cursor: pointer; }
    .file-header .file-path:hover { text-decoration: underline; color: var(--vscode-textLink-foreground); }
    .file-header .file-count { opacity: .6; font-weight: 400; font-size: .82em; flex-shrink: 0; }
    .file-body { padding: 0 8px 8px; }

    /* folder group */
    .folder-group { margin-bottom: 16px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .folder-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px;
                     background: var(--vscode-sideBarSectionHeader-background, var(--card-bg));
                     cursor: pointer; user-select: none; font-weight: 700; font-size: .92em;
                     border-bottom: 1px solid var(--border); transition: background .15s; }
    .folder-header:hover { background: var(--vscode-list-hoverBackground); }
    .folder-header .folder-checkbox { width: 18px; height: 18px; accent-color: var(--green); cursor: pointer; flex-shrink: 0; }
    .folder-header .folder-checkbox:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    .folder-header .folder-icon::before { content: "\\1F4C1"; margin-right: 4px; }
    .folder-header .folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .folder-header .folder-count { opacity: .6; font-weight: 400; font-size: .82em; flex-shrink: 0; }
    .folder-body { padding: 0 4px 4px 24px; }
    .folder-body .file-section { border-left: none; border-right: none; border-radius: 0; margin-bottom: 0; border-bottom: 1px solid var(--border); }
    .folder-body .file-section:last-child { border-bottom: none; }
    .folder-body .file-body { padding-left: 12px; }

    /* change card */
    .change-card { border: 1px solid var(--border); border-radius: 6px; margin: 8px 0; overflow: hidden; transition: border-color .2s, box-shadow .2s, opacity .2s; }
    .change-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    .change-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px;
                     background: var(--card-bg); cursor: pointer; user-select: none; transition: background .15s; }
    .change-header:hover { background: var(--vscode-list-hoverBackground); }
    .change-header .checkbox { width: 18px; height: 18px; accent-color: var(--green); cursor: pointer; flex-shrink: 0; }
    .change-header .checkbox:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    .change-header .rule { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
                           padding: 1px 8px; border-radius: 8px; font-size: .78em; }
    .change-header .lines { opacity: .6; font-size: .82em; margin-left: auto; cursor: pointer; }
    .change-header .lines:hover { text-decoration: underline; color: var(--vscode-textLink-foreground); opacity: 1; }
    .explanation { padding: 6px 12px 8px; font-size: .85em; opacity: .8; border-bottom: 1px solid var(--border); }

    /* reasoning + axe */
    .reasoning { padding: 4px 12px 8px; font-size: .82em; opacity: .75; border-bottom: 1px solid var(--border); font-style: italic; }
    .caveat { padding: 4px 12px 6px; font-size: .82em; color: var(--orange); border-bottom: 1px solid var(--border); }
    .caveat::before { content: "\\26A0  "; }
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

    .diff { display: grid; grid-template-columns: 1fr 1fr; font-family: var(--vscode-editor-font-family, monospace);
            font-size: .82em; line-height: 1.5; }
    .diff-label { padding: 4px 12px; font-weight: 600; font-size: .78em; text-transform: uppercase; opacity: .6;
                  border-bottom: 1px solid var(--border); }
    .diff-label.before { border-right: 1px solid var(--border); }
    .diff-code { padding: 8px 12px; white-space: pre-wrap; word-break: break-word; overflow-x: auto; }
    .diff-code.before { background: rgba(255,80,80,0.06); border-right: 1px solid var(--border); }
    .diff-code.after  { background: rgba(80,200,80,0.06); }

    .change-card.accepted { border-color: var(--green); }
    .change-card.rejected { opacity: .5; border-color: var(--border); }
    ${getCommandBarCss()}
  </style>
</head>
<body>
  ${getCommandBarHtml()}
  <h1>A11y Bulk Fix Preview</h1>
  <div class="subtitle">${totalChanges} proposed change(s) across ${totalFiles} file(s)</div>

  ${riskBanner}

  <div class="toolbar">
    <button id="selectAll" class="secondary">Select All</button>
    <button id="deselectAll" class="secondary">Deselect All</button>
    <span class="spacer"></span>
    <span id="selCount" class="count">0 selected</span>
    <button id="applySelected">Apply Selected</button>
    <button id="dismiss" class="secondary">Dismiss</button>
  </div>

  <div id="files">${fileSections}</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    ${getCommandBarJs()}

    function updateCount() {
      const checked = document.querySelectorAll('.change-checkbox:checked').length;
      document.getElementById('selCount').textContent = checked + ' selected';
    }

    function syncFileCheckbox(fileSection) {
      const fcb = fileSection.querySelector('.file-checkbox');
      const cbs = fileSection.querySelectorAll('.change-checkbox');
      const allChecked = [...cbs].every(cb => cb.checked);
      const someChecked = [...cbs].some(cb => cb.checked);
      fcb.checked = allChecked;
      fcb.indeterminate = someChecked && !allChecked;
    }

    function setCardState(card, checked) {
      card.classList.toggle('accepted', checked);
      card.classList.toggle('rejected', !checked);
    }

    // File-level select/deselect
    document.querySelectorAll('.file-section').forEach(fs => {
      const fcb = fs.querySelector('.file-checkbox');
      const header = fs.querySelector('.file-header');

      header.addEventListener('click', (e) => {
        if (e.target === fcb) return;
        fcb.checked = !fcb.checked;
        fcb.indeterminate = false;
        fs.querySelectorAll('.change-checkbox').forEach(cb => { cb.checked = fcb.checked; });
        fs.querySelectorAll('.change-card').forEach(card => setCardState(card, fcb.checked));
        const fg = fs.closest('.folder-group');
        if (fg) syncFolderCheckbox(fg);
        updateCount();
      });

      fcb.addEventListener('change', () => {
        fcb.indeterminate = false;
        fs.querySelectorAll('.change-checkbox').forEach(cb => { cb.checked = fcb.checked; });
        fs.querySelectorAll('.change-card').forEach(card => setCardState(card, fcb.checked));
        const fg = fs.closest('.folder-group');
        if (fg) syncFolderCheckbox(fg);
        updateCount();
      });
    });

    // Individual change checkboxes
    document.querySelectorAll('.change-card').forEach(card => {
      const hdr = card.querySelector('.change-header');
      const cb = card.querySelector('.change-checkbox');

      hdr.addEventListener('click', (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        setCardState(card, cb.checked);
        syncFileCheckbox(card.closest('.file-section'));
        const fg = card.closest('.folder-group');
        if (fg) syncFolderCheckbox(fg);
        updateCount();
      });

      cb.addEventListener('change', () => {
        setCardState(card, cb.checked);
        syncFileCheckbox(card.closest('.file-section'));
        const fg = card.closest('.folder-group');
        if (fg) syncFolderCheckbox(fg);
        updateCount();
      });
    });

    // Folder-level select/deselect
    function syncFolderCheckbox(fg) {
      const fcb = fg.querySelector('.folder-checkbox');
      const cbs = fg.querySelectorAll('.change-checkbox');
      const allChecked = [...cbs].every(cb => cb.checked);
      const someChecked = [...cbs].some(cb => cb.checked);
      fcb.checked = allChecked;
      fcb.indeterminate = someChecked && !allChecked;
    }

    document.querySelectorAll('.folder-group').forEach(fg => {
      const fcb = fg.querySelector('.folder-checkbox');
      const header = fg.querySelector('.folder-header');

      header.addEventListener('click', (e) => {
        if (e.target === fcb) return;
        fcb.checked = !fcb.checked;
        fcb.indeterminate = false;
        fg.querySelectorAll('.change-checkbox').forEach(cb => { cb.checked = fcb.checked; });
        fg.querySelectorAll('.file-checkbox').forEach(cb => { cb.checked = fcb.checked; cb.indeterminate = false; });
        fg.querySelectorAll('.change-card').forEach(card => setCardState(card, fcb.checked));
        updateCount();
      });

      fcb.addEventListener('change', () => {
        fcb.indeterminate = false;
        fg.querySelectorAll('.change-checkbox').forEach(cb => { cb.checked = fcb.checked; });
        fg.querySelectorAll('.file-checkbox').forEach(cb => { cb.checked = fcb.checked; cb.indeterminate = false; });
        fg.querySelectorAll('.change-card').forEach(card => setCardState(card, fcb.checked));
        updateCount();
      });
    });

    document.getElementById('selectAll').addEventListener('click', () => {
      document.querySelectorAll('.change-checkbox, .file-checkbox, .folder-checkbox').forEach(cb => {
        cb.checked = true; cb.indeterminate = false;
      });
      document.querySelectorAll('.change-card').forEach(c => setCardState(c, true));
      updateCount();
    });

    document.getElementById('deselectAll').addEventListener('click', () => {
      document.querySelectorAll('.change-checkbox, .file-checkbox, .folder-checkbox').forEach(cb => {
        cb.checked = false; cb.indeterminate = false;
      });
      document.querySelectorAll('.change-card').forEach(c => setCardState(c, false));
      updateCount();
    });

    document.getElementById('applySelected').addEventListener('click', () => {
      const accepted = [];
      document.querySelectorAll('.change-checkbox:checked').forEach(cb => {
        accepted.push(cb.dataset.key);
      });
      vscode.postMessage({ type: 'applySelected', accepted });
    });

    document.getElementById('dismiss').addEventListener('click', () => {
      vscode.postMessage({ type: 'dismiss' });
    });

    // File name click -> open file in editor
    document.querySelectorAll('.file-path').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openFile', uri: el.dataset.uri });
      });
    });

    // Line number click -> open file at that line
    document.querySelectorAll('.lines[data-uri]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openFile', uri: el.dataset.uri, line: parseInt(el.dataset.line, 10) });
      });
    });

    // DEFAULT SELECTION: check all changes
    document.querySelectorAll('.change-card').forEach(card => {
      const cb = card.querySelector('.change-checkbox');
      cb.checked = true;
      setCardState(card, true);
    });
    document.querySelectorAll('.file-section').forEach(fs => syncFileCheckbox(fs));
    document.querySelectorAll('.folder-group').forEach(fg => syncFolderCheckbox(fg));
    updateCount();
  </script>
</body>
</html>`;
  }

  private buildFileSection(entry: BulkFixFileEntry, fileIdx: number): string {
    const cards = entry.changes.map(c => this.buildChangeCard(c, fileIdx)).join('\n');
    return `
    <div class="file-section" data-fi="${fileIdx}">
      <div class="file-header">
        <input type="checkbox" class="file-checkbox" id="file-cb-${fileIdx}" checked aria-label="Select all changes in ${esc(entry.relativePath)}" />
        <label for="file-cb-${fileIdx}" class="file-path" title="${esc(entry.relativePath)}" data-uri="${esc(entry.uri.toString())}">${esc(entry.relativePath)}</label>
        <span class="file-count">${entry.changes.length} change(s)</span>
      </div>
      <div class="file-body">${cards}</div>
    </div>`;
  }

  private buildFolderGroupedSections(): string {
    // Group files by folder
    const folderMap = new Map<string, { entry: BulkFixFileEntry; fileIdx: number }[]>();
    this.result.files.forEach((entry, fi) => {
      const lastSlash = entry.relativePath.lastIndexOf('/');
      const folder = lastSlash >= 0 ? entry.relativePath.substring(0, lastSlash) : '.';
      if (!folderMap.has(folder)) { folderMap.set(folder, []); }
      folderMap.get(folder)!.push({ entry, fileIdx: fi });
    });

    // If only one folder, skip folder grouping
    if (folderMap.size <= 1) {
      return this.result.files.map((entry, fi) => this.buildFileSection(entry, fi)).join('\n');
    }

    // Sort folders alphabetically
    const sortedFolders = [...folderMap.keys()].sort();
    return sortedFolders.map((folder, folderIdx) => {
      const files = folderMap.get(folder)!;
      const totalChanges = files.reduce((sum, f) => sum + f.entry.changes.length, 0);
      const fileSections = files.map(f => this.buildFileSection(f.entry, f.fileIdx)).join('\n');
      const displayFolder = folder === '.' ? '(root)' : folder;
      const folderId = `folder-cb-${folderIdx}`;
      return `
      <div class="folder-group">
        <div class="folder-header">
          <input type="checkbox" class="folder-checkbox" id="${folderId}" checked aria-label="Select all changes in ${esc(displayFolder)}" />
          <label for="${folderId}"><span class="folder-icon"></span>
          <span class="folder-name">${esc(displayFolder)}</span></label>
          <span class="folder-count">${files.length} file(s), ${totalChanges} change(s)</span>
        </div>
        <div class="folder-body">${fileSections}</div>
      </div>`;
    }).join('\n');
  }

  private getFileUri(fileIdx: number): string {
    return this.result.files[fileIdx]?.uri.toString() ?? '';
  }

  private buildChangeCard(change: A11yChange, fileIdx: number): string {
    const key = `${fileIdx}-${change.id}`;

    // Reasoning section
    const reasoning = change.reasoning ?? '';
    // Extract caveat from reasoning if it contains "Caveat:"
    const caveatMatch = reasoning.match(/Caveat:\s*(.+?)(?:\s*\||$)/);
    const caveatHtml = caveatMatch
      ? `<div class="caveat">${esc(caveatMatch[1].trim())}</div>`
      : '';
    // Show reasoning without the caveat part
    const cleanReasoning = reasoning.replace(/\|\s*Caveat:\s*[^|]+/, '').trim();
    const reasoningHtml = cleanReasoning
      ? `<div class="reasoning">${esc(cleanReasoning)}</div>`
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
    <div class="change-card" data-key="${key}">
      <div class="change-header">
        <input type="checkbox" class="checkbox change-checkbox" data-key="${key}" id="change-cb-${key}" aria-label="${esc(change.explanation)}" />
        <label for="change-cb-${key}"><strong>${esc(change.explanation)}</strong></label>
        <span class="rule">${esc(change.rule)}</span>
        ${this.buildConfidenceBadge(change.confidence)}
        <span class="lines" data-uri="${esc(this.getFileUri(fileIdx))}" data-line="${change.startLine}">Lines ${change.startLine}\u2013${change.endLine}</span>
      </div>
      ${axeHtml}
      ${reasoningHtml}
      ${caveatHtml}
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
    BulkFixPreviewPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

