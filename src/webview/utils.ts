export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

/** Commands shown in the command bar across all webviews. */
const A11Y_COMMANDS = [
  { id: 'a11y.showReport', label: 'Accessibility Report', icon: '\u{1F4CA}' },
  { id: 'a11y.screenReaderPreview', label: 'Screen Reader Preview', icon: '\u{1F50A}' },
  { id: 'a11y.bulkFixFile', label: 'Static Fix File', icon: '\u{1F527}' },
  { id: 'a11y.bulkFixWorkspace', label: 'Static Fix Workspace', icon: '\u{1F6E0}' },
  { id: 'a11y.fixFile', label: 'AI Fix File', icon: '\u{2728}' },
  { id: 'a11y.bulkAiFix', label: 'AI Fix Workspace', icon: '\u{1F916}' },
  { id: 'a11y.generateTests', label: 'Generate A11y Tests', icon: '\u{1F9EA}' },
  { id: 'a11y.exportReport', label: 'Export Report', icon: '\u{1F4E4}' },
  { id: 'a11y.setApiKey', label: 'Set AI API Key', icon: '\u{1F511}' },
  { id: 'a11y.openSettings', label: 'Settings', icon: '\u{2699}' },
];

/** Set of allowed command IDs for webview message validation. */
export const ALLOWED_COMMANDS = new Set(A11Y_COMMANDS.map(c => c.id));

/** Escape JSON for safe embedding inside a <script> block. */
export function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003c');
}

/** CSS for the command bar. Include inside a <style> block. */
export function getCommandBarCss(): string {
  return `
    .cmd-bar { position: fixed; top: 8px; right: 16px; z-index: 100; }
    .cmd-bar-toggle { background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-family: inherit;
      font-size: .82em; display: flex; align-items: center; gap: 4px; }
    .cmd-bar-toggle:hover { opacity: .85; }
    .cmd-bar-toggle:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .cmd-bar-toggle::before { content: "\\2630"; font-size: 1.1em; }
    .cmd-bar-menu { display: none; position: absolute; top: 100%; right: 0; margin-top: 4px;
      background: var(--vscode-menu-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
      border-radius: 6px; min-width: 220px; padding: 4px 0;
      box-shadow: 0 4px 16px rgba(0,0,0,.25); }
    .cmd-bar-menu.open { display: block; }
    .cmd-bar-item { display: flex; align-items: center; gap: 8px; padding: 6px 14px; cursor: pointer;
      font-size: .85em; color: var(--vscode-menu-foreground, var(--vscode-foreground));
      transition: background .1s; white-space: nowrap; border: none; background: none; width: 100%;
      font-family: inherit; text-align: left; }
    .cmd-bar-item:hover { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); }
    .cmd-bar-item:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: -2px; }
    .cmd-bar-sep { height: 1px; background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border)); margin: 4px 8px; }`;
}

/** HTML for the command bar. Include right after <body>. */
export function getCommandBarHtml(): string {
  // Insert a separator after the first 3 items (scan/report/preview) and after fix commands
  const scanItems = A11Y_COMMANDS.slice(0, 3).map(c =>
    `<button class="cmd-bar-item" role="menuitem" data-cmd="${c.id}" title="${c.label}" tabindex="-1"><span>${c.icon}</span> ${c.label}</button>`
  ).join('\n');
  const fixItems = A11Y_COMMANDS.slice(3, 7).map(c =>
    `<button class="cmd-bar-item" role="menuitem" data-cmd="${c.id}" title="${c.label}" tabindex="-1"><span>${c.icon}</span> ${c.label}</button>`
  ).join('\n');
  const otherItems = A11Y_COMMANDS.slice(7).map(c =>
    `<button class="cmd-bar-item" role="menuitem" data-cmd="${c.id}" title="${c.label}" tabindex="-1"><span>${c.icon}</span> ${c.label}</button>`
  ).join('\n');

  return `
  <div class="cmd-bar">
    <button class="cmd-bar-toggle" title="A11y Commands" aria-haspopup="true" aria-expanded="false">Commands</button>
    <div class="cmd-bar-menu" role="menu" aria-label="Accessify Commands">
      ${scanItems}
      <div class="cmd-bar-sep" role="separator"></div>
      ${fixItems}
      <div class="cmd-bar-sep" role="separator"></div>
      ${otherItems}
    </div>
  </div>`;
}

/** JS for the command bar. Include inside a <script> block. Assumes `vscode` API is available. */
export function getCommandBarJs(): string {
  return `
    (function() {
      const toggle = document.querySelector('.cmd-bar-toggle');
      const menu = document.querySelector('.cmd-bar-menu');
      if (!toggle || !menu) return;
      const items = Array.from(menu.querySelectorAll('.cmd-bar-item'));

      function openMenu() {
        menu.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
        if (items.length > 0) { items[0].setAttribute('tabindex', '0'); items[0].focus(); }
      }

      function closeMenu() {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        items.forEach(i => i.setAttribute('tabindex', '-1'));
        toggle.focus();
      }

      toggle.addEventListener('click', (e) => { e.stopPropagation(); if (menu.classList.contains('open')) closeMenu(); else openMenu(); });
      document.addEventListener('click', () => { if (menu.classList.contains('open')) closeMenu(); });
      menu.addEventListener('click', (e) => e.stopPropagation());

      menu.addEventListener('keydown', (e) => {
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); const next = (idx + 1) % items.length; items.forEach(i => i.setAttribute('tabindex', '-1')); items[next].setAttribute('tabindex', '0'); items[next].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); const prev = (idx - 1 + items.length) % items.length; items.forEach(i => i.setAttribute('tabindex', '-1')); items[prev].setAttribute('tabindex', '0'); items[prev].focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items.forEach(i => i.setAttribute('tabindex', '-1')); items[0].setAttribute('tabindex', '0'); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items.forEach(i => i.setAttribute('tabindex', '-1')); items[items.length - 1].setAttribute('tabindex', '0'); items[items.length - 1].focus(); }
        else if (e.key === 'Tab') { closeMenu(); }
      });

      items.forEach(btn => {
        btn.addEventListener('click', () => {
          closeMenu();
          vscode.postMessage({ type: 'runCommand', command: btn.dataset.cmd });
        });
      });
    })();`;
}
