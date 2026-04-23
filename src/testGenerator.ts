import * as vscode from 'vscode';
import { scanForA11yIssues } from './scanner/astScanner';
import type { A11yIssue } from './types';
import { resolveActiveDocument } from './editorUtils';

/**
 * Generates @testing-library/react accessibility tests for the current file.
 * Tests verify:
 *  - Elements have accessible names
 *  - Images have alt text
 *  - Buttons / links are keyboard-accessible
 *  - ARIA roles are correct
 *  - Form controls have labels
 *  - Color contrast (visual note, can't auto-test in JSDOM)
 */
export async function generateA11yTests(): Promise<void> {
  const doc = await resolveActiveDocument(
    new Set(['typescriptreact', 'javascriptreact', 'html']),
    /\.a11y\.test\./i,
  );

  if (!doc) {
    vscode.window.showWarningMessage('Accessify: No TSX, JSX, or HTML file is open.');
    return;
  }

  const sourceText = doc.getText();
  const issues = scanForA11yIssues(sourceText, doc.fileName);

  const componentName = inferComponentName(sourceText, doc.fileName);
  const testCode = buildTestFile(componentName, issues, doc.fileName);

  // Determine output path: same directory, *.a11y.test.tsx
  const originalPath = doc.uri.fsPath;
  const ext = originalPath.endsWith('.tsx') ? '.tsx' : '.jsx';
  const baseName = originalPath.replace(/\.(tsx|jsx)$/, '');
  const testPath = `${baseName}.a11y.test${ext}`;

  const testUri = vscode.Uri.file(testPath);

  // Check if file already exists
  let fileExists = false;
  try {
    await vscode.workspace.fs.stat(testUri);
    fileExists = true;
  } catch {
    // File doesn't exist — proceed with fresh generation
  }

  const encoder = new TextEncoder();

  if (fileExists) {
    const existingBytes = await vscode.workspace.fs.readFile(testUri);
    const existingContent = new TextDecoder().decode(existingBytes);
    const newTests = extractMergeableTests(testCode, existingContent);

    const fileName = testPath.replace(/\\/g, '/').split('/').pop();

    if (newTests.length === 0) {
      vscode.window.showInformationMessage(
        `Accessify: ${fileName} is already up-to-date — no new tests to add.`,
      );
      const testDoc = await vscode.workspace.openTextDocument(testUri);
      await vscode.window.showTextDocument(testDoc, { viewColumn: vscode.ViewColumn.Active, preview: false });
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `Accessify: ${fileName} already exists. ${newTests.length} new test(s) detected.`,
      { modal: true },
      'Merge (append new)',
      'Overwrite',
    );

    if (!choice) { return; }

    if (choice === 'Merge (append new)') {
      const merged = mergeTests(existingContent, newTests);
      await vscode.workspace.fs.writeFile(testUri, encoder.encode(merged));
      const testDoc = await vscode.workspace.openTextDocument(testUri);
      await vscode.window.showTextDocument(testDoc, { viewColumn: vscode.ViewColumn.Active, preview: false });
      vscode.window.showInformationMessage(
        `Accessify: Merged ${newTests.length} new test(s) into ${fileName}.`,
      );
      return;
    }

    // Overwrite
    await vscode.workspace.fs.writeFile(testUri, encoder.encode(testCode));
  } else {
    await vscode.workspace.fs.writeFile(testUri, encoder.encode(testCode));
  }

  const testDoc = await vscode.workspace.openTextDocument(testUri);
  await vscode.window.showTextDocument(testDoc, { viewColumn: vscode.ViewColumn.Active, preview: false });

  vscode.window.showInformationMessage(
    `Accessify: Generated ${issues.length > 0 ? issues.length : 'baseline'} accessibility test(s).`,
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function inferComponentName(source: string, filePath: string): string {
  // Try to find `export default function Foo` or `export default class Foo` or `function Foo`
  const fnMatch = source.match(/export\s+(?:default\s+)?function\s+(\w+)/);
  if (fnMatch) { return fnMatch[1]; }
  const classMatch = source.match(/export\s+(?:default\s+)?class\s+(\w+)/);
  if (classMatch) { return classMatch[1]; }

  // Arrow / const component — prefer PascalCase names and skip ALL_CAPS constants
  const constMatches = source.matchAll(/(?:export\s+(?:default\s+)?)?const\s+(\w+)\s*[=:]/g);
  let fallbackConst: string | undefined;
  for (const m of constMatches) {
    const name = m[1];
    // Skip ALL_CAPS names — they're constants, not components
    if (/^[A-Z][A-Z0-9_]+$/.test(name)) {
      if (!fallbackConst) { fallbackConst = name; }
      continue;
    }
    // PascalCase names are React components
    if (/^[A-Z]/.test(name)) { return name; }
    if (!fallbackConst) { fallbackConst = name; }
  }
  if (fallbackConst) { return fallbackConst; }

  // Fallback: derive from filename
  const base = filePath.replace(/\\/g, '/').split('/').pop() || 'Component';
  return base.replace(/\.(tsx|jsx)$/, '').replace(/[^a-zA-Z0-9]/g, '');
}

function buildTestFile(
  componentName: string,
  issues: A11yIssue[],
  filePath: string,
): string {
  const relImport = `./${filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.(tsx|jsx)$/, '')}`;

  const lines: string[] = [];
  lines.push(`import { render, screen, within } from '@testing-library/react';`);
  lines.push(`import userEvent from '@testing-library/user-event';`);
  lines.push(`import { axe, toHaveNoViolations } from 'jest-axe';`);
  lines.push(`import ${componentName} from '${relImport}';`);
  lines.push('');
  lines.push(`expect.extend(toHaveNoViolations);`);
  lines.push('');
  lines.push(`describe('${componentName} – Accessibility', () => {`);

  lines.push(`  it('should render without crashing', () => {`);
  lines.push(`    render(<${componentName} />);`);
  lines.push(`  });`);
  lines.push('');

  lines.push(`  it('should have no axe violations', async () => {`);
  lines.push(`    const { container } = render(<${componentName} />);`);
  lines.push(`    const results = await axe(container);`);
  lines.push(`    expect(results).toHaveNoViolations();`);
  lines.push(`  });`);
  lines.push('');

  // Group issues by rule for consolidated tests
  const byRule = new Map<string, A11yIssue[]>();
  for (const issue of issues) {
    const arr = byRule.get(issue.rule) || [];
    arr.push(issue);
    byRule.set(issue.rule, arr);
  }

  // ── img-alt / nextjs-image-alt ──
  const imgIssues = [...(byRule.get('img-alt') || []), ...(byRule.get('nextjs-image-alt') || [])];
  if (imgIssues.length > 0) {
    lines.push(`  it('images should have accessible alt text', () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    const images = screen.getAllByRole('img');`);
    lines.push(`    images.forEach((img) => {`);
    lines.push(`      expect(img).toHaveAttribute('alt');`);
    lines.push(`      expect(img.getAttribute('alt')).not.toBe('');`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── button-label ──
  if (byRule.has('button-label')) {
    lines.push(`  it('buttons should have accessible names', () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    const buttons = screen.getAllByRole('button');`);
    lines.push(`    buttons.forEach((button) => {`);
    lines.push(`      expect(button).toHaveAccessibleName();`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── form-label ──
  if (byRule.has('form-label')) {
    lines.push(`  it('form controls should have accessible labels', () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    const textboxes = screen.queryAllByRole('textbox');`);
    lines.push(`    textboxes.forEach((input) => {`);
    lines.push(`      expect(input).toHaveAccessibleName();`);
    lines.push(`    });`);
    lines.push(`    const comboboxes = screen.queryAllByRole('combobox');`);
    lines.push(`    comboboxes.forEach((select) => {`);
    lines.push(`      expect(select).toHaveAccessibleName();`);
    lines.push(`    });`);
    lines.push(`    const spinbuttons = screen.queryAllByRole('spinbutton');`);
    lines.push(`    spinbuttons.forEach((input) => {`);
    lines.push(`      expect(input).toHaveAccessibleName();`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── heading-order ──
  if (byRule.has('heading-order')) {
    lines.push(`  it('headings should follow a logical hierarchy', () => {`);
    lines.push(`    const { container } = render(<${componentName} />);`);
    lines.push(`    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');`);
    lines.push(`    const levels = Array.from(headings).map(h => parseInt(h.tagName[1]));`);
    lines.push(``);
    lines.push(`    for (let i = 1; i < levels.length; i++) {`);
    lines.push(`      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);`);
    lines.push(`    }`);
    lines.push(``);
    lines.push(`    const h1Count = levels.filter(l => l === 1).length;`);
    lines.push(`    expect(h1Count).toBeLessThanOrEqual(1);`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── click-events-have-key-events ──
  if (byRule.has('click-events-have-key-events')) {
    lines.push(`  it('clickable elements should be keyboard-accessible', async () => {`);
    lines.push(`    const user = userEvent.setup();`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    const buttons = screen.getAllByRole('button');`);
    lines.push(`    for (const el of buttons) {`);
    lines.push(`      el.focus();`);
    lines.push(`      expect(el).toHaveFocus();`);
    lines.push(`      await user.keyboard('{Enter}');`);
    lines.push(`    }`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── aria-role ──
  if (byRule.has('aria-role')) {
    lines.push(`  it('should only use valid ARIA roles', () => {`);
    lines.push(`    const { container } = render(<${componentName} />);`);
    lines.push(`    const withRole = container.querySelectorAll('[role]');`);
    lines.push(`    const validRoles = new Set([`);
    lines.push(`      'alert', 'alertdialog', 'application', 'article', 'banner',`);
    lines.push(`      'button', 'cell', 'checkbox', 'columnheader', 'combobox',`);
    lines.push(`      'complementary', 'contentinfo', 'definition', 'dialog',`);
    lines.push(`      'directory', 'document', 'feed', 'figure', 'form', 'grid',`);
    lines.push(`      'gridcell', 'group', 'heading', 'img', 'link', 'list',`);
    lines.push(`      'listbox', 'listitem', 'log', 'main', 'marquee', 'math',`);
    lines.push(`      'menu', 'menubar', 'menuitem', 'menuitemcheckbox',`);
    lines.push(`      'menuitemradio', 'navigation', 'none', 'note', 'option',`);
    lines.push(`      'presentation', 'progressbar', 'radio', 'radiogroup',`);
    lines.push(`      'region', 'row', 'rowgroup', 'rowheader', 'scrollbar',`);
    lines.push(`      'search', 'searchbox', 'separator', 'slider', 'spinbutton',`);
    lines.push(`      'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel',`);
    lines.push(`      'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree',`);
    lines.push(`      'treegrid', 'treeitem',`);
    lines.push(`    ]);`);
    lines.push(`    withRole.forEach((el) => {`);
    lines.push(`      expect(validRoles).toContain(el.getAttribute('role'));`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── aria-pattern ──
  if (byRule.has('aria-pattern')) {
    lines.push(`  it('ARIA widgets should follow WAI-ARIA patterns', () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    const dialogs = screen.queryAllByRole('dialog');`);
    lines.push(`    dialogs.forEach((dialog) => {`);
    lines.push(`      expect(dialog).toHaveAccessibleName();`);
    lines.push(`    });`);
    lines.push(`    const tablist = screen.queryByRole('tablist');`);
    lines.push(`    if (tablist) {`);
    lines.push(`      const tabs = within(tablist).getAllByRole('tab');`);
    lines.push(`      expect(tabs.length).toBeGreaterThan(0);`);
    lines.push(`    }`);
    lines.push(`    const tabs = screen.queryAllByRole('tab');`);
    lines.push(`    tabs.forEach((tab) => {`);
    lines.push(`      const hasControls = tab.hasAttribute('aria-controls');`);
    lines.push(`      const hasSelected = tab.hasAttribute('aria-selected');`);
    lines.push(`      expect(hasControls || hasSelected).toBe(true);`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── no-mouse-only-hover ──
  if (byRule.has('no-mouse-only-hover')) {
    lines.push(`  it('hover content should also be keyboard-accessible', async () => {`);
    lines.push(`    const user = userEvent.setup();`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    const interactiveEls = screen.queryAllByRole('button');`);
    lines.push(`    for (const el of interactiveEls) {`);
    lines.push(`      await user.tab();`);
    lines.push(`      if (document.activeElement === el) {`);
    lines.push(`        expect(el).toHaveFocus();`);
    lines.push(`      }`);
    lines.push(`    }`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── autocomplete-valid ──
  if (byRule.has('autocomplete-valid')) {
    lines.push(`  it('personal data inputs should have valid autocomplete attributes', () => {`);
    lines.push(`    const { container } = render(<${componentName} />);`);
    lines.push(`    const personalInputTypes = ['email', 'tel', 'password'];`);
    lines.push(`    personalInputTypes.forEach((type) => {`);
    lines.push(`      const inputs = container.querySelectorAll(\`input[type="\${type}"]\`);`);
    lines.push(`      inputs.forEach((input) => {`);
    lines.push(`        expect(input).toHaveAttribute('autoComplete');`);
    lines.push(`      });`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── nextjs-head-lang ──
  if (byRule.has('nextjs-head-lang')) {
    lines.push(`  it('HTML document should have a lang attribute', () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    expect(document.documentElement).toHaveAttribute('lang');`);
    lines.push(`    expect(document.documentElement.lang).not.toBe('');`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── nextjs-link-text ──
  if (byRule.has('nextjs-link-text')) {
    lines.push(`  it('links should have discernible text', () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    const links = screen.getAllByRole('link');`);
    lines.push(`    links.forEach((link) => {`);
    lines.push(`      expect(link).toHaveAccessibleName();`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── color-contrast ──
  if (byRule.has('color-contrast')) {
    lines.push(`  it('should meet WCAG AA color contrast requirements', async () => {`);
    lines.push(`    const { container } = render(<${componentName} />);`);
    lines.push(`    const results = await axe(container, { runOnly: ['color-contrast'] });`);
    lines.push(`    expect(results).toHaveNoViolations();`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── no-autofocus ──
  if (byRule.has('no-autofocus')) {
    lines.push(`  it('should not use autoFocus attribute', () => {`);
    lines.push(`    const { container } = render(<${componentName} />);`);
    lines.push(`    const autoFocused = container.querySelectorAll('[autofocus]');`);
    lines.push(`    expect(autoFocused.length).toBe(0);`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── interactive-supports-focus ──
  if (byRule.has('interactive-supports-focus')) {
    lines.push(`  it('interactive elements should be focusable', () => {`);
    lines.push(`    const { container } = render(<${componentName} />);`);
    lines.push(`    const interactive = container.querySelectorAll('[onclick], [onmousedown]');`);
    lines.push(`    interactive.forEach((el) => {`);
    lines.push(`      const tagName = el.tagName.toLowerCase();`);
    lines.push(`      const isNativeFocusable = ['a', 'button', 'input', 'select', 'textarea'].includes(tagName);`);
    lines.push(`      if (!isNativeFocusable) {`);
    lines.push(`        expect(el).toHaveAttribute('tabindex');`);
    lines.push(`      }`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}

/* ── Merge helpers ──────────────────────────────────────────────────────── */

/**
 * Extracts individual `it(...)` blocks from generated test code that don't
 * already exist in the existing file (matched by test description string).
 */
function extractMergeableTests(generatedCode: string, existingContent: string): string[] {
  // Extract it/it.todo blocks from the generated code
  const testBlocks = extractItBlocks(generatedCode);

  // Collect test descriptions already present in the existing file
  const existingDescriptions = new Set<string>();
  const descRegex = /it(?:\.todo)?\(\s*['"`](.*?)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = descRegex.exec(existingContent)) !== null) {
    existingDescriptions.add(match[1]);
  }

  // Return only blocks whose description is not already present
  return testBlocks.filter(block => {
    const blockDesc = block.match(/it(?:\.todo)?\(\s*['"`](.*?)['"`]/);
    return blockDesc && !existingDescriptions.has(blockDesc[1]);
  });
}

/**
 * Extracts complete `it(...)` / `it.todo(...)` blocks (including preceding
 * comment blocks) from a generated test file string.
 */
function extractItBlocks(code: string): string[] {
  const lines = code.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let braceDepth = 0;
  let inBlock = false;
  let inCommentBlock = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Track comment blocks that precede an it() — e.g. color-contrast advisory
    if (!inBlock && trimmed.startsWith('/**') || (!inBlock && trimmed.startsWith('/*') && !trimmed.startsWith('/*\n') && !trimmed.includes('Issues detected'))) {
      inCommentBlock = true;
      current.push(line);
      continue;
    }
    if (inCommentBlock && !inBlock) {
      current.push(line);
      if (trimmed.includes('*/')) {
        inCommentBlock = false;
      }
      continue;
    }

    // Detect start of it(...) or it.todo(...)
    if (!inBlock && (trimmed.startsWith('it(') || trimmed.startsWith('it.todo('))) {
      inBlock = true;
      current.push(line);

      // it.todo(...) is a single line
      if (trimmed.startsWith('it.todo(')) {
        blocks.push(current.join('\n'));
        current = [];
        inBlock = false;
        continue;
      }

      // Count braces for the opening line
      for (const ch of line) {
        if (ch === '{') { braceDepth++; }
        if (ch === '}') { braceDepth--; }
      }
      if (braceDepth <= 0) {
        blocks.push(current.join('\n'));
        current = [];
        inBlock = false;
        braceDepth = 0;
      }
      continue;
    }

    if (inBlock) {
      current.push(line);
      for (const ch of line) {
        if (ch === '{') { braceDepth++; }
        if (ch === '}') { braceDepth--; }
      }
      if (braceDepth <= 0) {
        blocks.push(current.join('\n'));
        current = [];
        inBlock = false;
        braceDepth = 0;
      }
      continue;
    }

    // If we gathered comment lines but no it() followed, discard them
    if (!inBlock && !inCommentBlock && current.length > 0) {
      current = [];
    }
  }

  return blocks;
}

/**
 * Inserts `newTests` into an existing test file just before the final `});`
 * that closes the top-level describe block.
 */
function mergeTests(existingContent: string, newTests: string[]): string {
  const lines = existingContent.split('\n');

  // Find the last `});` — closing the describe block
  let insertIdx = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trimStart().startsWith('});')) {
      insertIdx = i;
      break;
    }
  }

  const before = lines.slice(0, insertIdx);
  const after = lines.slice(insertIdx);

  // Ensure a blank line separator
  if (before.length > 0 && before[before.length - 1].trim() !== '') {
    before.push('');
  }

  const merged = [...before, ...newTests.map(t => t + '\n'), ...after];
  return merged.join('\n');
}
