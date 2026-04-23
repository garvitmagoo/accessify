import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce, getCommandBarCss, getCommandBarHtml, getCommandBarJs, ALLOWED_COMMANDS } from './utils';
import { loadConfig, invalidateConfigCache } from '../config';

/** All built-in rules with human-readable labels. */
const ALL_RULES: { id: string; label: string }[] = [
  { id: 'img-alt', label: 'Image alt text' },
  { id: 'button-label', label: 'Button accessible name' },
  { id: 'aria-role', label: 'Valid ARIA roles' },
  { id: 'form-label', label: 'Form control labels' },
  { id: 'click-events-have-key-events', label: 'Keyboard support for click handlers' },
  { id: 'aria-pattern', label: 'ARIA widget patterns' },
  { id: 'color-contrast', label: 'Color contrast ratio' },
  { id: 'heading-order', label: 'Heading level order' },
  { id: 'autocomplete-valid', label: 'Autocomplete attribute on inputs' },
  { id: 'no-mouse-only-hover', label: 'Keyboard-accessible hover content' },
  { id: 'no-autofocus', label: 'No autoFocus attribute' },
  { id: 'interactive-supports-focus', label: 'Interactive elements focusable' },
  { id: 'no-noninteractive-element-interactions', label: 'No handlers on non-interactive elements' },
  { id: 'svg-has-accessible-name', label: 'SVG accessible name' },
  { id: 'nextjs-image-alt', label: 'Next.js Image alt text' },
  { id: 'nextjs-head-lang', label: 'Next.js Html lang attribute' },
  { id: 'nextjs-link-text', label: 'Next.js Link discernible text' },
  { id: 'anchor-is-valid', label: 'Anchor is valid' },
  { id: 'focus-visible', label: 'Focus indicator visible' },
  { id: 'label-has-associated-control', label: 'Label has associated control' },
  { id: 'media-has-caption', label: 'Media has captions' },
  { id: 'page-title', label: 'Page has title' },
  { id: 'prefer-semantic-elements', label: 'Prefer semantic elements' },
  { id: 'skip-link', label: 'Skip navigation link' },
];

/**
 * Webview panel that provides a visual UI for editing Accessify settings
 * instead of requiring users to edit JSON.
 */
export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private _writeQueue: Promise<void> = Promise.resolve();

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (msg: { type: string; key?: string; value?: unknown; command?: string;
                     ruleId?: string; enabled?: boolean;
                     allEnabled?: boolean;
                     exclude?: string[]; aiExclude?: string[] }) => {
        if (msg.type === 'runCommand' && msg.command && ALLOWED_COMMANDS.has(msg.command)) {
          vscode.commands.executeCommand(msg.command);
          return;
        }
        if (msg.type === 'update' && msg.key) {
          const config = vscode.workspace.getConfiguration('a11y');
          await config.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
        }
        if (msg.type === 'setApiKey') {
          vscode.commands.executeCommand('a11y.setApiKey');
        }
        if (msg.type === 'toggleRule' && msg.ruleId) {
          await this.toggleRule(msg.ruleId, msg.enabled ?? true);
        }
        if (msg.type === 'setAllRules' && msg.allEnabled !== undefined) {
          await this.setAllRules(msg.allEnabled);
        }
        if (msg.type === 'updateExclude') {
          await this.updateA11yrc({ exclude: msg.exclude, aiExclude: msg.aiExclude });
        }
        if (msg.type === 'requestConfig') {
          await this.sendCurrentConfig();
        }
      },
      null,
      this.disposables,
    );

    // Re-send config if settings change externally
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('a11y')) {
          this.sendCurrentConfig();
        }
      }),
    );
  }

  public static createOrShow(): void {
    const column = vscode.ViewColumn.One;
    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel.panel.reveal(column);
      ConfigPanel.currentPanel.sendCurrentConfig();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'a11yConfig',
      'Accessify Settings',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    ConfigPanel.currentPanel = new ConfigPanel(panel);
    ConfigPanel.currentPanel.panel.webview.html = ConfigPanel.currentPanel.getHtml();
    ConfigPanel.currentPanel.sendCurrentConfig();
  }

  private async sendCurrentConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration('a11y');
    const a11yrc = await loadConfig();

    // Build rule enabled map
    const ruleStates: Record<string, boolean> = {};
    for (const rule of ALL_RULES) {
      const rc = a11yrc.rules?.[rule.id];
      if (rc === false || (rc && rc.enabled === false)) {
        ruleStates[rule.id] = false;
      } else {
        ruleStates[rule.id] = true;
      }
    }

    this.panel.webview.postMessage({
      type: 'configUpdate',
      values: {
        aiProvider: config.get<string>('aiProvider', 'none'),
        aiModel: config.get<string>('aiModel', ''),
        aiEndpoint: config.get<string>('aiEndpoint', ''),
        aiBatchConcurrency: config.get<number>('aiBatchConcurrency', 10),
        scanConcurrency: config.get<number>('scanConcurrency', 8),
        scanOnSave: config.get<boolean>('scanOnSave', true),
        scanOnOpen: config.get<boolean>('scanOnOpen', true),
        severity: config.get<string>('severity', 'warning'),
        ruleStates,
        exclude: a11yrc.exclude ?? [],
        aiExclude: a11yrc.aiExclude ?? [],
      },
    });
  }

  /** Serialize an async operation through the write queue to avoid races. */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    this._writeQueue = this._writeQueue.then(fn, fn);
    return this._writeQueue;
  }

  /** Toggle a rule on/off in .a11yrc.json. */
  private toggleRule(ruleId: string, enabled: boolean): Promise<void> {
    return this.enqueue(async () => {
      const a11yrc = await this.readA11yrc();
      if (!a11yrc.rules) { a11yrc.rules = {}; }

      if (enabled) {
        delete a11yrc.rules[ruleId];
      } else {
        a11yrc.rules[ruleId] = false;
      }

      // Clean up empty rules object
      if (Object.keys(a11yrc.rules).length === 0) {
        delete a11yrc.rules;
      }

      await this.writeA11yrc(a11yrc);
    });
  }

  /** Enable or disable all rules in a single write. */
  private setAllRules(enabled: boolean): Promise<void> {
    return this.enqueue(async () => {
      const a11yrc = await this.readA11yrc();
      if (enabled) {
        delete a11yrc.rules;
      } else {
        a11yrc.rules = {};
        for (const rule of ALL_RULES) {
          a11yrc.rules[rule.id] = false;
        }
      }
      await this.writeA11yrc(a11yrc);
    });
  }

  /** Update exclude/aiExclude in .a11yrc.json. */
  private updateA11yrc(updates: { exclude?: string[]; aiExclude?: string[] }): Promise<void> {
    return this.enqueue(async () => {
      const a11yrc = await this.readA11yrc();
      if (updates.exclude !== undefined) {
        a11yrc.exclude = updates.exclude.length > 0 ? updates.exclude : undefined;
      }
      if (updates.aiExclude !== undefined) {
        a11yrc.aiExclude = updates.aiExclude.length > 0 ? updates.aiExclude : undefined;
      }
      await this.writeA11yrc(a11yrc);
    });
  }

  private getA11yrcUri(): vscode.Uri | null {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) { return null; }
    return vscode.Uri.file(path.join(ws.uri.fsPath, '.a11yrc.json'));
  }

  private async readA11yrc(): Promise<Record<string, any>> {
    const uri = this.getA11yrcUri();
    if (!uri) { return {}; }
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(raw).toString('utf-8'));
    } catch {
      return {};
    }
  }

  private async writeA11yrc(obj: Record<string, any>): Promise<void> {
    const uri = this.getA11yrcUri();
    if (!uri) { return; }
    // Remove undefined values
    const clean = JSON.parse(JSON.stringify(obj));
    const content = JSON.stringify(clean, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    invalidateConfigCache();
    await this.sendCurrentConfig();
  }

  private dispose(): void {
    ConfigPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }

  private getHtml(): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    const ruleCheckboxes = ALL_RULES.map(r =>
      `<div class="field toggle-row">
        <input type="checkbox" id="rule-${r.id}" data-rule="${r.id}" checked />
        <label for="rule-${r.id}">${r.label} <code>${r.id}</code></label>
      </div>`
    ).join('\n    ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Accessify Settings</title>
  <style nonce="${nonce}">
    ${getCommandBarCss()}
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
      background: var(--vscode-editor-background); padding: 24px; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.5em; margin-bottom: 4px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 24px; font-size: .9em; }
    fieldset { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 16px 20px;
      margin-bottom: 20px; }
    legend { font-weight: 600; font-size: 1.05em; padding: 0 6px; }
    .field { margin-bottom: 14px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: .88em; margin-bottom: 4px; font-weight: 500; }
    .desc { color: var(--vscode-descriptionForeground); font-size: .82em; margin-bottom: 6px; }
    select, input[type="text"], input[type="number"], textarea {
      width: 100%; padding: 6px 10px; border-radius: 4px; font-size: .9em;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: inherit;
    }
    textarea { resize: vertical; min-height: 60px; }
    select:focus, input:focus, textarea:focus { outline: 2px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .toggle-row { display: flex; align-items: center; gap: 10px; }
    .toggle-row label { margin-bottom: 0; cursor: pointer; }
    .toggle-row label code { font-size: .78em; color: var(--vscode-descriptionForeground); margin-left: 4px; }
    input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;
      accent-color: var(--vscode-button-background); }
    .btn { padding: 7px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: .88em;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      font-family: inherit; }
    .btn:hover { opacity: .9; }
    .btn:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .btn-row { display: flex; gap: 8px; margin-top: 8px; }
    .btn-secondary { padding: 5px 12px; border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      border-radius: 4px; cursor: pointer; font-size: .82em;
      background: transparent; color: var(--vscode-foreground); font-family: inherit; }
    .btn-secondary:hover { background: var(--vscode-list-hoverBackground); }
    .model-hint { color: var(--vscode-descriptionForeground); font-size: .78em; margin-top: 4px; }
    .conditional { display: none; }
    .conditional.visible { display: block; }
    .saved-indicator { color: var(--vscode-charts-green); font-size: .82em; opacity: 0;
      transition: opacity .3s; margin-left: 8px; }
    .saved-indicator.show { opacity: 1; }
    .rules-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .section-desc { color: var(--vscode-descriptionForeground); font-size: .82em; margin-bottom: 12px; }
  </style>
</head>
<body>
  ${getCommandBarHtml()}
  <h1>Accessify Settings</h1>
  <p class="subtitle">Configure accessibility scanning, AI fix options, and rule preferences.</p>

  <fieldset>
    <legend>AI Provider</legend>
    <div class="field">
      <label for="aiProvider">Provider</label>
      <div class="desc">Select the AI provider for generating fix suggestions.</div>
      <select id="aiProvider" data-key="aiProvider">
        <option value="none">None (AI disabled)</option>
        <option value="openai">OpenAI</option>
        <option value="azure-openai">Azure OpenAI</option>
        <option value="claude">Anthropic Claude</option>
      </select>
    </div>
    <div class="field conditional" id="endpointField">
      <label for="aiEndpoint">Azure Endpoint</label>
      <div class="desc">Your Azure OpenAI endpoint URL (must use HTTPS).</div>
      <input type="text" id="aiEndpoint" data-key="aiEndpoint" placeholder="https://your-resource.openai.azure.com" />
    </div>
    <div class="field conditional" id="modelField">
      <label for="aiModel">Model / Deployment</label>
      <div class="desc">Model name or Azure deployment ID. Leave empty for provider default.</div>
      <input type="text" id="aiModel" data-key="aiModel" placeholder="auto-detected from provider" />
      <div class="model-hint" id="modelHint"></div>
    </div>
    <div class="field conditional" id="apiKeyField">
      <button class="btn" id="setApiKeyBtn" type="button">Set API Key Securely</button>
      <div class="desc" style="margin-top:6px;">Uses VS Code SecretStorage — never stored in settings JSON.</div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Scanning</legend>
    <div class="field toggle-row">
      <input type="checkbox" id="scanOnSave" data-key="scanOnSave" />
      <label for="scanOnSave">Scan on save</label>
    </div>
    <div class="field toggle-row">
      <input type="checkbox" id="scanOnOpen" data-key="scanOnOpen" />
      <label for="scanOnOpen">Scan on open</label>
    </div>
    <div class="field">
      <label for="severity">Default diagnostic severity</label>
      <select id="severity" data-key="severity">
        <option value="error">Error</option>
        <option value="warning">Warning</option>
        <option value="information">Information</option>
        <option value="hint">Hint</option>
      </select>
    </div>
  </fieldset>

  <fieldset>
    <legend>Rules</legend>
    <div class="section-desc">Toggle individual accessibility rules on or off. Changes are saved to <code>.a11yrc.json</code> in your workspace.</div>
    <div class="btn-row" style="margin-bottom:12px;">
      <button class="btn-secondary" id="enableAllRules" type="button">Enable All</button>
      <button class="btn-secondary" id="disableAllRules" type="button">Disable All</button>
    </div>
    <div class="rules-grid">
      ${ruleCheckboxes}
    </div>
  </fieldset>

  <fieldset>
    <legend>Exclude Patterns</legend>
    <div class="field">
      <label for="exclude">Scan exclude globs</label>
      <div class="desc">Files matching these globs are skipped during scanning. One pattern per line.</div>
      <textarea id="exclude" rows="3" placeholder="e.g. **/generated/**&#10;**/vendor/**"></textarea>
    </div>
    <div class="field">
      <label for="aiExclude">AI exclude globs</label>
      <div class="desc">Files matching these globs are skipped during AI fix generation. One per line.</div>
      <textarea id="aiExclude" rows="3" placeholder="e.g. **/legacy/**"></textarea>
    </div>
  </fieldset>

  <fieldset>
    <legend>Performance</legend>
    <div class="field">
      <label for="aiBatchConcurrency">AI batch concurrency</label>
      <div class="desc">Files processed in parallel during bulk AI fix (1–10).</div>
      <input type="number" id="aiBatchConcurrency" data-key="aiBatchConcurrency" min="1" max="10" />
    </div>
    <div class="field">
      <label for="scanConcurrency">Scan concurrency</label>
      <div class="desc">Files scanned in parallel during workspace-wide operations (1–32).</div>
      <input type="number" id="scanConcurrency" data-key="scanConcurrency" min="1" max="32" />
    </div>
  </fieldset>

  <span class="saved-indicator" id="savedMsg" role="status" aria-live="polite">&#10003; Saved</span>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const MODEL_HINTS = {
      openai: 'e.g. gpt-4, gpt-4o, gpt-4o-mini',
      'azure-openai': 'Use your Azure deployment name',
      claude: 'e.g. claude-sonnet-4-20250514, claude-opus-4-20250514',
      none: '',
    };

    const elements = {
      aiProvider: document.getElementById('aiProvider'),
      aiModel: document.getElementById('aiModel'),
      aiEndpoint: document.getElementById('aiEndpoint'),
      aiBatchConcurrency: document.getElementById('aiBatchConcurrency'),
      scanConcurrency: document.getElementById('scanConcurrency'),
      scanOnSave: document.getElementById('scanOnSave'),
      scanOnOpen: document.getElementById('scanOnOpen'),
      severity: document.getElementById('severity'),
      modelHint: document.getElementById('modelHint'),
      endpointField: document.getElementById('endpointField'),
      modelField: document.getElementById('modelField'),
      apiKeyField: document.getElementById('apiKeyField'),
      savedMsg: document.getElementById('savedMsg'),
      exclude: document.getElementById('exclude'),
      aiExclude: document.getElementById('aiExclude'),
    };

    function updateVisibility() {
      const provider = elements.aiProvider.value;
      const isAi = provider !== 'none';
      elements.endpointField.classList.toggle('visible', provider === 'azure-openai');
      elements.modelField.classList.toggle('visible', isAi);
      elements.apiKeyField.classList.toggle('visible', isAi);
      elements.modelHint.textContent = MODEL_HINTS[provider] || '';
    }

    function flashSaved() {
      elements.savedMsg.classList.add('show');
      setTimeout(() => elements.savedMsg.classList.remove('show'), 1500);
    }

    function sendUpdate(key, value) {
      vscode.postMessage({ type: 'update', key, value });
      flashSaved();
    }

    // AI provider
    elements.aiProvider.addEventListener('change', () => {
      sendUpdate('aiProvider', elements.aiProvider.value);
      updateVisibility();
    });

    // Text fields with debounce
    for (const id of ['aiModel', 'aiEndpoint']) {
      let timer;
      elements[id].addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => sendUpdate(id, elements[id].value), 400);
      });
    }

    // Number fields
    for (const id of ['aiBatchConcurrency', 'scanConcurrency']) {
      elements[id].addEventListener('change', () => {
        const val = parseInt(elements[id].value, 10);
        if (!isNaN(val)) { sendUpdate(id, val); }
      });
    }

    // Checkboxes
    for (const id of ['scanOnSave', 'scanOnOpen']) {
      elements[id].addEventListener('change', () => {
        sendUpdate(id, elements[id].checked);
      });
    }

    elements.severity.addEventListener('change', () => {
      sendUpdate('severity', elements.severity.value);
    });

    document.getElementById('setApiKeyBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'setApiKey' });
    });

    // Rule toggles
    document.querySelectorAll('[data-rule]').forEach(cb => {
      cb.addEventListener('change', () => {
        vscode.postMessage({ type: 'toggleRule', ruleId: cb.dataset.rule, enabled: cb.checked });
        flashSaved();
      });
    });

    document.getElementById('enableAllRules').addEventListener('click', () => {
      document.querySelectorAll('[data-rule]').forEach(cb => { cb.checked = true; });
      vscode.postMessage({ type: 'setAllRules', allEnabled: true });
      flashSaved();
    });

    document.getElementById('disableAllRules').addEventListener('click', () => {
      document.querySelectorAll('[data-rule]').forEach(cb => { cb.checked = false; });
      vscode.postMessage({ type: 'setAllRules', allEnabled: false });
      flashSaved();
    });

    // Exclude patterns (debounced)
    for (const id of ['exclude', 'aiExclude']) {
      let timer;
      elements[id].addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const lines = elements.exclude.value.split('\\n').map(s => s.trim()).filter(Boolean);
          const aiLines = elements.aiExclude.value.split('\\n').map(s => s.trim()).filter(Boolean);
          vscode.postMessage({ type: 'updateExclude', exclude: lines, aiExclude: aiLines });
          flashSaved();
        }, 600);
      });
    }

    // Receive config from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'configUpdate') {
        const v = msg.values;
        elements.aiProvider.value = v.aiProvider;
        elements.aiModel.value = v.aiModel;
        elements.aiEndpoint.value = v.aiEndpoint;
        elements.aiBatchConcurrency.value = v.aiBatchConcurrency;
        elements.scanConcurrency.value = v.scanConcurrency;
        elements.scanOnSave.checked = v.scanOnSave;
        elements.scanOnOpen.checked = v.scanOnOpen;
        elements.severity.value = v.severity;
        updateVisibility();

        // Update rule checkboxes
        if (v.ruleStates) {
          for (const [ruleId, enabled] of Object.entries(v.ruleStates)) {
            const cb = document.getElementById('rule-' + ruleId);
            if (cb) { cb.checked = enabled; }
          }
        }

        // Update exclude textareas
        elements.exclude.value = (v.exclude || []).join('\\n');
        elements.aiExclude.value = (v.aiExclude || []).join('\\n');
      }
    });

    // Request initial config
    vscode.postMessage({ type: 'requestConfig' });

    ${getCommandBarJs()}
  </script>
</body>
</html>`;
  }
}
