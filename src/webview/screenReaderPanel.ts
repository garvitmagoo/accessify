import * as vscode from 'vscode';
import { simulateScreenReader, simulateTabOrder, ScreenReaderAnnouncement, TabStop } from '../scanner/screenReaderSimulator';
import { escapeHtml as esc, getNonce, getCommandBarCss, getCommandBarHtml, getCommandBarJs, ALLOWED_COMMANDS, escapeJsonForScript } from './utils';
import { resolveActiveDocument } from '../editorUtils';

/**
 * Webview panel that shows what a screen reader would announce
 * for elements in the active file.
 */
export class ScreenReaderPanel {
  public static currentPanel: ScreenReaderPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  /** Last known text document — used as fallback when the webview steals focus. */
  private lastDocument: vscode.TextDocument | undefined;

  private constructor(panel: vscode.WebviewPanel, initialDocument?: vscode.TextDocument) {
    this.panel = panel;
    this.lastDocument = initialDocument;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview (click-to-navigate)
    this.panel.webview.onDidReceiveMessage(
      (msg: { command?: string; type?: string; line?: number; column?: number }) => {
        if (msg.type === 'runCommand' && msg.command && ALLOWED_COMMANDS.has(msg.command)) {
          vscode.commands.executeCommand(msg.command);
          return;
        }
        if (msg.command === 'goToLine' && msg.line !== undefined) {
          const doc = this.lastDocument;
          if (!doc) { return; }
          const pos = new vscode.Position(msg.line, msg.column ?? 0);
          vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(pos, pos),
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
          });
        }
      },
      null,
      this.disposables,
    );

    // Refresh when the active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.lastDocument = editor.document;
        }
        this.refresh();
      }),
    );

    // Debounced refresh when the active document is edited
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        const relevantDoc = vscode.window.activeTextEditor?.document ?? this.lastDocument;
        if (relevantDoc === e.document) {
          if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
          this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            this.refresh();
          }, 500);
        }
      }),
    );
  }

  public static async createOrShow(): Promise<void> {
    const column = vscode.ViewColumn.Two;
    // Capture the active editor BEFORE creating/revealing the panel,
    // because the webview steals focus and makes activeTextEditor undefined.
    const currentEditor = vscode.window.activeTextEditor;
    // Fall back through visible editors / open tabs if no active editor
    const initialDoc = currentEditor?.document ?? await resolveActiveDocument(
      new Set(['typescriptreact', 'javascriptreact', 'typescript', 'javascript', 'html']),
    );

    if (ScreenReaderPanel.currentPanel) {
      if (initialDoc) {
        ScreenReaderPanel.currentPanel.lastDocument = initialDoc;
      }
      ScreenReaderPanel.currentPanel.panel.reveal(column);
      ScreenReaderPanel.currentPanel.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'a11yScreenReader',
      'Screen Reader Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    ScreenReaderPanel.currentPanel = new ScreenReaderPanel(panel, initialDoc);
    ScreenReaderPanel.currentPanel.refresh();
  }

  public refresh(): void {
    const editor = vscode.window.activeTextEditor;
    const doc = editor?.document ?? this.lastDocument;

    if (!doc) {
      this.panel.webview.html = buildEmptyHtml(this.panel.webview, 'No active file');
      return;
    }

    const supported = ['typescriptreact', 'javascriptreact', 'typescript', 'javascript', 'html'];
    if (!supported.includes(doc.languageId)) {
      this.panel.webview.html = buildEmptyHtml(this.panel.webview, 'Not a JSX/TSX/HTML file');
      return;
    }

    const announcements = simulateScreenReader(doc.getText(), doc.fileName);
    const tabStops = simulateTabOrder(doc.getText(), doc.fileName);
    this.panel.webview.html = buildHtml(announcements, tabStops, vscode.workspace.asRelativePath(doc.uri), this.panel.webview);
  }

  private dispose(): void {
    ScreenReaderPanel.currentPanel = undefined;
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

/* ── HTML builders ──────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  landmark: 'Landmarks',
  heading: 'Headings',
  interactive: 'Interactive',
  form: 'Form Controls',
  table: 'Tables',
  list: 'Lists',
  image: 'Images',
  'live-region': 'Live Regions',
  other: 'Other',
};

const CATEGORY_ICONS: Record<string, string> = {
  landmark: '&#127760;',
  heading: '&#128220;',
  interactive: '&#128073;',
  form: '&#128221;',
  table: '&#128202;',
  list: '&#128203;',
  image: '&#128444;',
  'live-region': '&#128226;',
  other: '&#128300;',
};

function buildEmptyHtml(_webview: vscode.Webview, reason: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 90vh;
      margin: 0;
    }
    .empty-state {
      text-align: center;
      opacity: .5;
      font-size: .95em;
    }
    .empty-state::before {
      content: "\\1F50A";
      display: block;
      font-size: 2em;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <div class="empty-state"><p>${esc(reason)}</p></div>
</body>
</html>`;
}

function buildHtml(items: ScreenReaderAnnouncement[], tabStops: TabStop[], filePath: string, _webview: vscode.Webview): string {
  const issueCount = items.filter(i => i.hasIssue).length;
  const nonce = getNonce();

  // Group items by category
  const categories = new Map<string, ScreenReaderAnnouncement[]>();
  for (const item of items) {
    const cat = item.category || 'other';
    if (!categories.has(cat)) { categories.set(cat, []); }
    categories.get(cat)!.push(item);
  }

  // Build category summary chips
  const categoryChips = Array.from(categories.entries()).map(([cat, catItems]) => {
    const hasIssues = catItems.some(i => i.hasIssue);
    return `<button class="cat-chip ${hasIssues ? 'has-issue' : ''}" data-category="${cat}" title="Filter: ${CATEGORY_LABELS[cat] || cat}">
      <span class="chip-icon">${CATEGORY_ICONS[cat] || '&#128300;'}</span>
      <span class="chip-label">${CATEGORY_LABELS[cat] || cat}</span>
      <span class="chip-count">${catItems.length}</span>
    </button>`;
  }).join('');

  // Build heading outline
  const headings = items.filter(i => i.category === 'heading');
  const headingOutline = headings.length > 0 ? headings.map(h => {
    const levelMatch = h.role.match(/heading level (\d)/);
    const level = levelMatch ? parseInt(levelMatch[1]) : 1;
    const indent = (level - 1) * 16;
    const cls = h.hasIssue ? 'outline-issue' : '';
    return `<div class="outline-item ${cls}" style="padding-left:${indent}px" data-line="${h.line}" data-col="${h.column}" tabindex="0" role="button">
      <span class="outline-level">H${level}</span>
      <span class="outline-name">${esc(h.accessibleName || '(empty)')}</span>
    </div>`;
  }).join('') : '<div class="outline-empty">No headings found</div>';

  const rows = items.map((a, idx) => {
    const cls = a.hasIssue ? 'issue' : '';
    const icon = a.hasIssue ? '&#9888;' : '&#128266;';
    const issueTag = a.hasIssue && a.issueMessage
      ? `<div class="issue-msg">${esc(a.issueMessage)}</div>`
      : '';
    const descTag = a.description
      ? `<div class="desc-msg">Description: ${esc(a.description)}</div>`
      : '';

    return `
      <tr class="${cls}" data-idx="${idx}" data-category="${a.category}" data-line="${a.line}" data-col="${a.column}" tabindex="0" role="button" aria-label="${esc(a.announcement)}">
        <td class="idx">${idx + 1}</td>
        <td class="icon">${icon}</td>
        <td>
          <div class="announcement">${esc(a.announcement)}</div>
          <div class="meta">
            <span class="element">${esc(a.element)}</span>
            <span class="role">${esc(a.role)}</span>
            <span class="category-tag">${esc(CATEGORY_LABELS[a.category] || a.category)}</span>
            <span class="loc">line ${a.line + 1}</span>
          </div>
          ${descTag}
          ${issueTag}
        </td>
        <td class="play-cell">
          <button class="play-btn" data-idx="${idx}" title="Speak this announcement">&#9654;</button>
        </td>
      </tr>`;
  }).join('');

  // Build tab order rows
  const tabOrderIssueCount = tabStops.filter(t => t.hasIssue).length;
  const tabOrderRows = tabStops.length > 0 ? tabStops.map((t, idx) => {
    const cls = t.hasIssue ? 'issue' : '';
    const icon = t.hasIssue ? '&#9888;' : '&#8677;';
    const issueTag = t.hasIssue && t.issueMessage
      ? `<div class="issue-msg">${esc(t.issueMessage)}</div>`
      : '';
    const tabIdxLabel = t.tabIndex > 0
      ? `<span class="role" style="background:var(--orange);color:#000;">tabIndex=${t.tabIndex}</span>`
      : '';

    return `
      <tr class="${cls}" data-line="${t.line}" data-col="${t.column}" tabindex="0" role="button" aria-label="Tab stop ${idx + 1}: ${esc(t.accessibleName || t.element)}">
        <td class="idx">${idx + 1}</td>
        <td class="icon">${icon}</td>
        <td>
          <div class="announcement">${esc(t.accessibleName || '(no name)')}, ${esc(t.role)}</div>
          <div class="meta">
            <span class="element">${esc(t.element)}</span>
            <span class="role">${esc(t.role)}</span>
            ${tabIdxLabel}
            <span class="loc">line ${t.line + 1}</span>
          </div>
          ${issueTag}
        </td>
      </tr>`;
  }).join('') : '';

  // JSON-encode announcements for the speech script
  const announcementsJson = escapeJsonForScript(JSON.stringify(items.map(a => a.announcement)));
  const itemsDataJson = escapeJsonForScript(JSON.stringify(items.map(a => ({ line: a.line, column: a.column, category: a.category }))));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Screen Reader Preview</title>
  <style>
    :root {
      --card-bg: var(--vscode-editor-inactiveSelectionBackground);
      --border: var(--vscode-panel-border);
      --green: var(--vscode-charts-green, #89d185);
      --orange: var(--vscode-charts-orange, #cca700);
      --blue: var(--vscode-charts-blue, #6fc3df);
      --red: var(--vscode-charts-red, #f14c4c);
      --radius: 6px;
    }
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; margin: 0; line-height: 1.5; }
    h1 { font-size: 1.3em; margin: 0 0 4px; }
    .subtitle { opacity: .6; font-size: .85em; margin-bottom: 16px; }
    .summary { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .summary-item { text-align: center; min-width: 80px; flex: 1; padding: 12px 10px; background: var(--card-bg); border-radius: var(--radius); border: 1px solid var(--border); transition: transform .15s; }
    .summary-item:hover { transform: translateY(-2px); }
    .summary-item .number { font-size: 1.6em; font-weight: bold; }
    .summary-item .label { font-size: .78em; opacity: .6; margin-top: 4px; text-transform: uppercase; letter-spacing: .3px; }
    .ok .number { color: var(--green); }
    .warn .number { color: var(--orange); }

    /* Tabs */
    .tabs { display: flex; gap: 0; margin-bottom: 0; border-bottom: 1px solid var(--border); }
    .tab-btn { padding: 8px 16px; border: none; background: transparent; color: var(--vscode-foreground); font-family: inherit; font-size: .85em; cursor: pointer; border-bottom: 2px solid transparent; opacity: .6; transition: opacity .15s, border-color .15s; }
    .tab-btn:hover { opacity: .9; }
    .tab-btn.active { opacity: 1; border-bottom-color: var(--blue); font-weight: 600; }
    .tab-btn:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
    .tab-content { display: none; padding-top: 12px; }
    .tab-content.active { display: block; }

    /* Category chips for filtering */
    .filter-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; align-items: center; }
    .filter-label { font-size: .78em; opacity: .5; text-transform: uppercase; letter-spacing: .3px; margin-right: 4px; }
    .cat-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 14px; background: transparent; color: var(--vscode-foreground); font-family: inherit; font-size: .78em; cursor: pointer; transition: background .15s, border-color .15s, transform .1s; }
    .cat-chip:hover { background: var(--card-bg); transform: translateY(-1px); }
    .cat-chip:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
    .cat-chip.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
    .cat-chip.has-issue { border-color: var(--orange); }
    .cat-chip .chip-icon { font-size: 1em; }
    .cat-chip .chip-count { font-weight: 600; opacity: .7; }
    .show-all-btn { padding: 4px 10px; border: 1px solid var(--border); border-radius: 14px; background: transparent; color: var(--vscode-foreground); font-family: inherit; font-size: .78em; cursor: pointer; transition: background .15s; }
    .show-all-btn:hover { background: var(--card-bg); }
    .show-all-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
    .show-all-btn:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
    .issues-only-btn { padding: 4px 10px; border: 1px solid var(--orange); border-radius: 14px; background: transparent; color: var(--orange); font-family: inherit; font-size: .78em; cursor: pointer; transition: background .15s; }
    .issues-only-btn:hover { background: rgba(204, 167, 0, .15); }
    .issues-only-btn.active { background: var(--orange); color: var(--vscode-editor-background); }
    .issues-only-btn:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }

    /* Search */
    .search-bar { margin-bottom: 12px; }
    .search-bar input { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; font-size: .85em; }
    .search-bar input:focus { outline: 2px solid var(--blue); outline-offset: -1px; border-color: var(--blue); }
    .search-bar input::placeholder { color: var(--vscode-input-placeholderForeground); }

    /* Heading outline */
    .outline-section { margin-bottom: 8px; }
    .outline-item { padding: 4px 8px; cursor: pointer; border-radius: 4px; font-size: .85em; display: flex; align-items: center; gap: 8px; transition: background .15s; }
    .outline-item:hover { background: var(--card-bg); }
    .outline-item:focus-visible { outline: 2px solid var(--blue); outline-offset: -1px; }
    .outline-item.outline-issue .outline-name { color: var(--orange); }
    .outline-level { font-weight: 700; font-size: .75em; padding: 1px 5px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); flex-shrink: 0; }
    .outline-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .outline-empty { opacity: .5; font-size: .85em; padding: 8px; }

    table { width: 100%; border-collapse: collapse; }
    tr { border-bottom: 1px solid var(--border); transition: background .15s; cursor: pointer; }
    tr:hover { background: var(--card-bg); }
    tr:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
    tr.issue { background: rgba(255, 80, 80, 0.07); }
    tr.speaking { background: rgba(80, 160, 255, 0.15); }
    tr.hidden-row { display: none; }
    td { padding: 8px 6px; vertical-align: top; }
    .idx { width: 28px; opacity: .45; font-size: .85em; text-align: right; padding-right: 10px; }
    .icon { width: 22px; font-size: 1.1em; }
    .announcement { font-weight: 500; margin-bottom: 3px; }
    .meta { display: flex; gap: 10px; font-size: .8em; opacity: .6; flex-wrap: wrap; }
    .element { font-family: var(--vscode-editor-font-family, monospace); }
    .role { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 6px; border-radius: 8px; font-size: .85em; }
    .category-tag { background: var(--card-bg); padding: 1px 6px; border-radius: 8px; font-size: .85em; }
    .loc { margin-left: auto; }
    .issue-msg { margin-top: 4px; font-size: .82em; color: var(--vscode-errorForeground); }
    .desc-msg { margin-top: 3px; font-size: .82em; opacity: .7; font-style: italic; }
    .empty { text-align: center; padding: 40px 20px; opacity: .5; font-size: .9em; }

    /* Voice controls */
    .voice-toolbar { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; padding: 12px 14px; background: var(--card-bg); border-radius: var(--radius); border: 1px solid var(--border); }
    .voice-toolbar .toolbar-row { display: flex; gap: 8px; align-items: center; }
    .voice-toolbar button { padding: 7px 16px; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;
      font-family: inherit; font-size: .85em; background: var(--vscode-button-background); color: var(--vscode-button-foreground); transition: opacity .15s, background .15s, transform .1s; }
    .voice-toolbar button:hover { opacity: .85; }
    .voice-toolbar button:active { transform: scale(.97); }
    .voice-toolbar button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    .voice-toolbar button.secondary { background: transparent; color: var(--vscode-foreground); border-color: var(--border); }
    .voice-toolbar button.secondary:hover { background: var(--vscode-list-hoverBackground); }
    .voice-toolbar button.active { background: var(--red); border-color: var(--red); }
    .voice-toolbar .spacer { flex: 1; }
    .voice-toolbar label { font-size: .78em; opacity: .5; text-transform: uppercase; letter-spacing: .3px; white-space: nowrap; }
    .voice-toolbar select { font-size: .82em; font-family: inherit; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground); max-width: 220px; min-width: 0; flex: 1; cursor: pointer; }
    .voice-toolbar select:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
    .voice-toolbar input[type="range"] { flex: 1; max-width: 120px; min-width: 60px; accent-color: var(--blue); cursor: pointer; }
    .rate-display { font-size: .82em; font-weight: 600; opacity: .8; min-width: 32px; text-align: center; font-variant-numeric: tabular-nums; }

    .play-cell { width: 36px; text-align: center; }
    .play-btn { background: transparent; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;
      color: var(--vscode-foreground); font-size: .9em; padding: 4px 8px; opacity: .7; transition: opacity .15s, background .15s; }
    .play-btn:hover { opacity: 1; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .play-btn:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    ${getCommandBarCss()}
  </style>
</head>
<body>
  ${getCommandBarHtml()}
  <h1>&#128266; Screen Reader Preview</h1>
  <div class="subtitle">${esc(filePath)}</div>

  <div class="summary">
    <div class="summary-item ${issueCount === 0 ? 'ok' : ''}">
      <div class="number">${items.length}</div>
      <div class="label">Elements</div>
    </div>
    <div class="summary-item ok">
      <div class="number">${items.length - issueCount}</div>
      <div class="label">Accessible</div>
    </div>
    <div class="summary-item ${issueCount > 0 ? 'warn' : 'ok'}">
      <div class="number">${issueCount}</div>
      <div class="label">Issues</div>
    </div>
  </div>

  <div class="tabs" role="tablist" aria-label="Screen reader preview tabs">
    <button class="tab-btn active" data-tab="all" role="tab" id="tab-btn-all" aria-selected="true" aria-controls="tab-all" tabindex="0">All Elements</button>
    <button class="tab-btn" data-tab="outline" role="tab" id="tab-btn-outline" aria-selected="false" aria-controls="tab-outline" tabindex="-1">Heading Outline</button>
    <button class="tab-btn" data-tab="taborder" role="tab" id="tab-btn-taborder" aria-selected="false" aria-controls="tab-taborder" tabindex="-1">&#9000; Tab Order</button>
  </div>

  <div id="tab-all" class="tab-content active" role="tabpanel" aria-labelledby="tab-btn-all">
    <div class="voice-toolbar">
      <div class="toolbar-row">
        <button id="playAll" title="Read all announcements sequentially">&#9654; Play All</button>
        <button id="stopBtn" class="secondary" title="Stop speaking">&#9632; Stop</button>
      </div>
      <div class="toolbar-row">
        <label for="voiceSelect">Voice</label>
        <select id="voiceSelect"></select>
        <label for="rateSlider">Speed</label>
        <input id="rateSlider" type="range" min="0.5" max="2" step="0.1" value="1" />
        <span id="rateDisplay" class="rate-display">1.0x</span>
      </div>
    </div>

    <div class="search-bar">
      <input type="text" id="searchInput" placeholder="Search announcements..." aria-label="Search announcements" />
    </div>

    <div class="filter-bar">
      <span class="filter-label">Filter</span>
      <button class="show-all-btn active" id="showAll">All</button>
      ${issueCount > 0 ? '<button class="issues-only-btn" id="issuesOnly">&#9888; Issues Only</button>' : ''}
      ${categoryChips}
    </div>

    ${items.length === 0
      ? '<p class="empty">No semantic or interactive elements found in this file.</p>'
      : `<table><tbody>${rows}</tbody></table>`}
  </div>

  <div id="tab-outline" class="tab-content" role="tabpanel" aria-labelledby="tab-btn-outline">
    <h2 style="font-size:1em; margin:0 0 10px; opacity:.7;">Heading Structure</h2>
    <div class="outline-section">
      ${headingOutline}
    </div>
  </div>

  <div id="tab-taborder" class="tab-content" role="tabpanel" aria-labelledby="tab-btn-taborder">
    <h2 style="font-size:1em; margin:0 0 10px; opacity:.7;">&#9000; Keyboard Tab Order</h2>
    <p style="font-size:.82em; opacity:.6; margin:0 0 12px;">Simulated sequence of elements reached by pressing Tab. Elements with positive tabIndex appear first (anti-pattern), followed by natural source order.</p>
    <div class="summary" style="margin-bottom:14px;">
      <div class="summary-item ${tabOrderIssueCount === 0 ? 'ok' : ''}">
        <div class="number">${tabStops.length}</div>
        <div class="label">Tab Stops</div>
      </div>
      <div class="summary-item ${tabOrderIssueCount > 0 ? 'warn' : 'ok'}">
        <div class="number">${tabOrderIssueCount}</div>
        <div class="label">Issues</div>
      </div>
    </div>
    ${tabStops.length === 0
      ? '<p class="empty">No focusable elements found in this file.</p>'
      : `<table><tbody>${tabOrderRows}</tbody></table>`}
  </div>

  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const vscode = vscodeApi;
    ${getCommandBarJs()}
    const announcements = ${announcementsJson};
    const itemsData = ${itemsDataJson};
    let currentUtterance = null;
    let playAllIndex = -1;
    let isPlayingAll = false;
    let activeFilter = 'all';
    let issuesOnly = false;

    // ── Tab switching with roving tabindex & arrow keys ──
    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    function activateTab(btn) {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
        b.setAttribute('tabindex', '-1');
      });
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      btn.setAttribute('tabindex', '0');
      btn.focus();
      const tabId = 'tab-' + btn.dataset.tab;
      const el = document.getElementById(tabId);
      if (el) el.classList.add('active');
    }
    tabBtns.forEach((btn, idx) => {
      btn.addEventListener('click', () => activateTab(btn));
      btn.addEventListener('keydown', (e) => {
        let nextIdx = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          nextIdx = (idx + 1) % tabBtns.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          nextIdx = (idx - 1 + tabBtns.length) % tabBtns.length;
        } else if (e.key === 'Home') {
          e.preventDefault();
          nextIdx = 0;
        } else if (e.key === 'End') {
          e.preventDefault();
          nextIdx = tabBtns.length - 1;
        }
        if (nextIdx >= 0) activateTab(tabBtns[nextIdx]);
      });
    });

    // ── Click-to-navigate for table rows ──
    document.querySelectorAll('tr[data-line]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.play-btn')) return;
        const line = parseInt(row.dataset.line, 10);
        const col = parseInt(row.dataset.col, 10) || 0;
        vscodeApi.postMessage({ command: 'goToLine', line, column: col });
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
        // Arrow key navigation between rows
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = row.nextElementSibling;
          if (next && next.matches('tr:not(.hidden-row)')) next.focus();
          else {
            let s = row.nextElementSibling;
            while (s && s.matches('.hidden-row')) s = s.nextElementSibling;
            if (s) s.focus();
          }
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = row.previousElementSibling;
          if (prev && prev.matches('tr:not(.hidden-row)')) prev.focus();
          else {
            let s = row.previousElementSibling;
            while (s && s.matches('.hidden-row')) s = s.previousElementSibling;
            if (s) s.focus();
          }
        }
      });
    });

    // ── Click-to-navigate for outline items ──
    document.querySelectorAll('.outline-item[data-line]').forEach(item => {
      item.addEventListener('click', () => {
        const line = parseInt(item.dataset.line, 10);
        const col = parseInt(item.dataset.col, 10) || 0;
        vscodeApi.postMessage({ command: 'goToLine', line, column: col });
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
      });
    });

    // ── Filtering ──
    function applyFilters() {
      const searchText = document.getElementById('searchInput').value.toLowerCase();
      document.querySelectorAll('tr[data-idx]').forEach(row => {
        const idx = parseInt(row.dataset.idx, 10);
        const category = row.dataset.category;
        const text = announcements[idx].toLowerCase();

        let show = true;
        if (activeFilter !== 'all' && category !== activeFilter) show = false;
        if (issuesOnly && !row.classList.contains('issue')) show = false;
        if (searchText && !text.includes(searchText)) show = false;

        row.classList.toggle('hidden-row', !show);
      });
    }

    // Show All button
    const showAllBtn = document.getElementById('showAll');
    showAllBtn.addEventListener('click', () => {
      activeFilter = 'all';
      issuesOnly = false;
      document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
      showAllBtn.classList.add('active');
      const ioBtn = document.getElementById('issuesOnly');
      if (ioBtn) ioBtn.classList.remove('active');
      applyFilters();
    });

    // Issues Only button
    const issuesOnlyBtn = document.getElementById('issuesOnly');
    if (issuesOnlyBtn) {
      issuesOnlyBtn.addEventListener('click', () => {
        issuesOnly = !issuesOnly;
        issuesOnlyBtn.classList.toggle('active', issuesOnly);
        if (issuesOnly) {
          activeFilter = 'all';
          document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
          showAllBtn.classList.remove('active');
        } else {
          showAllBtn.classList.add('active');
        }
        applyFilters();
      });
    }

    // Category chips
    document.querySelectorAll('.cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.category;
        if (activeFilter === cat) {
          activeFilter = 'all';
          chip.classList.remove('active');
          showAllBtn.classList.add('active');
        } else {
          activeFilter = cat;
          document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
          showAllBtn.classList.remove('active');
          chip.classList.add('active');
        }
        issuesOnly = false;
        const ioBtn = document.getElementById('issuesOnly');
        if (ioBtn) ioBtn.classList.remove('active');
        applyFilters();
      });
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', applyFilters);

    // Populate voice list
    const voiceSelect = document.getElementById('voiceSelect');
    const rateSlider = document.getElementById('rateSlider');
    const rateDisplay = document.getElementById('rateDisplay');

    function populateVoices() {
      const voices = speechSynthesis.getVoices();
      voiceSelect.innerHTML = '';
      const defaultVoices = voices.filter(v => v.lang.startsWith('en'));
      const voicesToShow = defaultVoices.length > 0 ? defaultVoices : voices;
      voicesToShow.forEach((voice, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = voice.name + ' (' + voice.lang + ')';
        if (voice.default) opt.selected = true;
        voiceSelect.appendChild(opt);
      });
    }

    if (speechSynthesis.getVoices().length > 0) {
      populateVoices();
    }
    speechSynthesis.onvoiceschanged = populateVoices;

    rateSlider.addEventListener('input', () => {
      rateDisplay.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x';
    });

    function getSelectedVoice() {
      const voices = speechSynthesis.getVoices();
      const defaultVoices = voices.filter(v => v.lang.startsWith('en'));
      const voicesToShow = defaultVoices.length > 0 ? defaultVoices : voices;
      const idx = parseInt(voiceSelect.value, 10);
      return voicesToShow[idx] || null;
    }

    function highlightRow(idx) {
      document.querySelectorAll('tr.speaking').forEach(r => r.classList.remove('speaking'));
      if (idx >= 0) {
        const row = document.querySelector('tr[data-idx="' + idx + '"]');
        if (row) { row.classList.add('speaking'); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      }
    }

    function speak(text, idx, onEnd) {
      speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = parseFloat(rateSlider.value);
      const voice = getSelectedVoice();
      if (voice) utter.voice = voice;
      highlightRow(idx);
      utter.onend = () => {
        highlightRow(-1);
        if (onEnd) onEnd();
      };
      utter.onerror = () => {
        highlightRow(-1);
        if (onEnd) onEnd();
      };
      currentUtterance = utter;
      speechSynthesis.speak(utter);
    }

    // Individual play buttons
    document.querySelectorAll('.play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        isPlayingAll = false;
        const idx = parseInt(btn.dataset.idx, 10);
        speak(announcements[idx], idx, null);
      });
    });

    // Play All button
    document.getElementById('playAll').addEventListener('click', () => {
      if (announcements.length === 0) return;
      isPlayingAll = true;
      playAllIndex = 0;
      const playAllBtn = document.getElementById('playAll');
      playAllBtn.classList.add('active');
      playAllBtn.textContent = '... Playing';

      function playNext() {
        if (!isPlayingAll || playAllIndex >= announcements.length) {
          isPlayingAll = false;
          playAllIndex = -1;
          playAllBtn.classList.remove('active');
          playAllBtn.textContent = '\\u25B6 Play All';
          highlightRow(-1);
          return;
        }
        // Skip hidden rows during play all
        const row = document.querySelector('tr[data-idx="' + playAllIndex + '"]');
        if (row && row.classList.contains('hidden-row')) {
          playAllIndex++;
          playNext();
          return;
        }
        speak(announcements[playAllIndex], playAllIndex, () => {
          playAllIndex++;
          playNext();
        });
      }
      playNext();
    });

    // Stop button
    document.getElementById('stopBtn').addEventListener('click', () => {
      isPlayingAll = false;
      speechSynthesis.cancel();
      highlightRow(-1);
      const playAllBtn = document.getElementById('playAll');
      playAllBtn.classList.remove('active');
      playAllBtn.textContent = '\\u25B6 Play All';
    });
  </script>
</body>
</html>`;
}
