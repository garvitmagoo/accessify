import * as vscode from 'vscode';
import { resolveActiveDocument } from './editorUtils';
import { getAiFix } from './ai/provider';
import type { A11yChange, FullFileFixResult } from './ai/fullFileFix';
import { BulkFixPreviewPanel } from './webview/bulkFixPreviewPanel';
import type { BulkFixFileEntry } from './webview/bulkFixPreviewPanel';
import { DiffPreviewPanel } from './webview/diffPreviewPanel';
import { getDiagnosticData, getRuleId } from './diagnostics';
import { scanForA11yIssues } from './scanner/astScanner';
import { loadConfig, applyConfig } from './config';
import { toVscodeSeverity } from './types';
import { VALID_ROLES } from './scanner/rules/ariaRole';
import { suggestAccessibleForeground } from './scanner/rules/colorContrast';
import { validateFix, getWcagTags, getHelpUrl, getStaticFixRisk, validateJsxSyntax } from './scanner/axeIntegration';
import {
  applyActions,
  insertAttributeIntoTag,
  findOpeningTagClose,
  computeSafeReplacement,
  escapeRegExp,
  findFabricatedAttribute,
} from './jsx/utils';

/** Find the closing `>` or `/>` of a multiline JSX opening tag. */
function findOpeningTagCloseMultiline(
  document: vscode.TextDocument,
  startLine: number,
  tagStartCol: number,
): { line: number; column: number } | null {
  let inString: string | false = false;
  let braceDepth = 0;
  let pastTagName = false;
  const maxLine = Math.min(startLine + 20, document.lineCount - 1);

  for (let lineNum = startLine; lineNum <= maxLine; lineNum++) {
    const lineText = document.lineAt(lineNum).text;
    const startCol = lineNum === startLine ? tagStartCol : 0;

    for (let i = startCol; i < lineText.length; i++) {
      const ch = lineText[i];

      if (!pastTagName) {
        if (ch === '<') { continue; }
        if (/[a-zA-Z0-9._-]/.test(ch)) { continue; }
        pastTagName = true;
      }

      if (inString) {
        if (ch === inString && (i === 0 || lineText[i - 1] !== '\\')) {
          inString = false;
        }
      } else if (ch === '"' || ch === "'") {
        inString = ch;
      } else if (ch === '{') {
        braceDepth++;
      } else if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (braceDepth === 0) {
        if (ch === '/' && i + 1 < lineText.length && lineText[i + 1] === '>') {
          return { line: lineNum, column: i };
        }
        if (ch === '>') {
          return { line: lineNum, column: i };
        }
      }
    }
  }

  return null;
}

/**
 * Extract the attribute name from an attribute string like `aria-label="value"`.
 */
function extractAttrName(attribute: string): string {
  const match = attribute.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  return match ? match[1] : attribute;
}

/**
 * Detect if the AI fix introduced a syntax-breaking change to attribute patterns.
 * Catches cases like: className="..." → className={...} (missing quotes)
 * or className="..." being removed/split incorrectly.
 */
function hasAttributeSyntaxBreak(original: string, replacement: string): boolean {
  // Extract attribute assignments from both: name="value" or name='value' or name={value}
  const attrPattern = /([a-zA-Z][\w-]*)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\{)/g;

  const origAttrs = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = attrPattern.exec(original)) !== null) {
    // Store the quote style: '"', "'", or '{'
    origAttrs.set(m[1], m[2][0]);
  }

  attrPattern.lastIndex = 0;
  while ((m = attrPattern.exec(replacement)) !== null) {
    const name = m[1];
    const newStyle = m[2][0];
    const origStyle = origAttrs.get(name);
    // If the attribute existed in original with quotes but now uses braces (or vice versa)
    // and it's a common string attribute, that's likely a break.
    if (origStyle && origStyle !== newStyle) {
      // Changing from string to expression or vice versa on these attrs is almost always wrong
      const stringOnlyAttrs = new Set(['className', 'class', 'id', 'href', 'src', 'alt', 'title', 'placeholder', 'name', 'type', 'rel']);
      if (stringOnlyAttrs.has(name) && (origStyle === '"' || origStyle === "'") && newStyle === '{') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check whether the JSX opening tag already contains an attribute with the
 * given name.  Works for both single-line and multiline tags.
 */
function tagAlreadyHasAttribute(
  document: vscode.TextDocument,
  startLine: number,
  tagStartCol: number,
  attrName: string,
): boolean {
  const span = findJsxOpeningTagSpan(document, startLine, tagStartCol);
  let tagText = '';
  for (let i = span.startLine; i <= span.endLine; i++) {
    tagText += document.lineAt(i).text + '\n';
  }
  const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(attrName)}(?:=|\\s|/?>)`, 'm');
  return pattern.test(tagText);
}

/** Find the span of the JSX opening tag (from `<Tag` to `>` or `/>`). */
function findJsxOpeningTagSpan(
  document: vscode.TextDocument,
  startLine: number,
  tagStartCol: number,
): { startLine: number; endLine: number } {
  const firstLineText = document.lineAt(startLine).text;

  const openClose = findOpeningTagClose(firstLineText, tagStartCol);
  if (openClose !== -1) {
    return { startLine, endLine: startLine };
  }

  const multiClose = findOpeningTagCloseMultiline(document, startLine, tagStartCol);
  if (!multiClose) {
    return { startLine, endLine: startLine };
  }

  return { startLine, endLine: multiClose.line };
}

/** Detect prop indentation from a multiline JSX opening tag. */
function detectPropIndentation(document: vscode.TextDocument, tagStartLine: number, tagCloseLine: number): string {
  for (let i = tagStartLine + 1; i < tagCloseLine; i++) {
    const text = document.lineAt(i).text;
    const trimmed = text.trim();
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('{/*')) {
      return text.match(/^(\s*)/)?.[1] ?? '';
    }
  }
  const tagIndent = document.lineAt(tagStartLine).text.match(/^(\s*)/)?.[1] ?? '';
  return tagIndent + '  ';
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) { dp[i][0] = i; }
  for (let j = 0; j <= n; j++) { dp[0][j] = j; }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Find the closest valid ARIA role by Levenshtein distance. */
function findClosestRole(invalid: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const role of VALID_ROLES) {
    const dist = levenshtein(invalid, role);
    if (dist < bestDist) {
      bestDist = dist;
      best = role;
    }
  }
  if (best && bestDist <= Math.max(3, Math.ceil(invalid.length / 2))) {
    return best;
  }
  return null;
}

/** Quick Fix code action provider for accessibility diagnostics. */
export class A11yCodeActionProvider implements vscode.CodeActionProvider {

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'Accessify') {
        continue;
      }

      // Add a manual/static quick fix based on the rule
      const staticFix = this.getStaticFix(document, diagnostic);
      if (staticFix) {
        actions.push(staticFix);
      }

      // Add an AI-powered fix option — skip for rules where the static fix is always complete
      // and the AI has no structured action type to express the change.
      // Also skip AI for color-contrast when a static fix was found (AI tends to mangle className syntax).
      const STATIC_ONLY_RULES = new Set(['no-autofocus', 'heading-order']);
      const rule = getRuleId(diagnostic);
      const skipAi = STATIC_ONLY_RULES.has(rule) || (rule === 'color-contrast' && staticFix !== null);
      const config = vscode.workspace.getConfiguration('a11y');
      if (config.get<string>('aiProvider', 'none') !== 'none' && !skipAi) {
        const aiFix = new vscode.CodeAction(
          `Accessify: AI Fix - ${diagnostic.message}`,
          vscode.CodeActionKind.QuickFix,
        );
        aiFix.diagnostics = [diagnostic];
        aiFix.command = {
          command: 'a11y.applyAiFix',
          title: 'Apply AI Accessibility Fix',
          arguments: [document.uri, diagnostic],
        };
        actions.push(aiFix);
      }
    }

    return actions;
  }

  private getStaticFix(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction | null {
    const rule = getRuleId(diagnostic);

    switch (rule) {
      case 'img-alt': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'alt=""',
          'Add empty alt attribute (decorative image)',
        );
      }

      case 'button-label': {
        // Try to infer a meaningful label from child icon name (e.g. <Close /> → "Close")
        const inferredLabel = this.inferIconLabel(document, diagnostic);
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          inferredLabel ? `aria-label="${inferredLabel}"` : 'aria-label="TODO: describe action"',
          inferredLabel ? `Add aria-label="${inferredLabel}"` : 'Add aria-label attribute',
        );
      }

      case 'form-label': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'aria-label="TODO: describe input"',
          'Add aria-label attribute',
        );
      }

      case 'click-events-have-key-events': {
        return this.createInsertAttributesFix(
          document,
          diagnostic,
          ['role="button"', 'tabIndex={0}', 'onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { /* handler */ } }}'],
          'Add keyboard support (role, tabIndex, onKeyDown)',
        );
      }

      case 'aria-pattern': {
        const msg = diagnostic.message;
        if (msg.includes('aria-labelledby') || msg.includes('aria-label')) {
          return this.createInsertAttributeFix(
            document,
            diagnostic,
            'aria-label="TODO: describe element"',
            'Add aria-label attribute',
          );
        }
        if (msg.includes('aria-expanded')) {
          return this.createInsertAttributeFix(
            document,
            diagnostic,
            'aria-expanded={false}',
            'Add aria-expanded attribute',
          );
        }
        if (msg.includes('aria-checked')) {
          return this.createInsertAttributeFix(
            document,
            diagnostic,
            'aria-checked={false}',
            'Add aria-checked attribute',
          );
        }
        if (msg.includes('aria-valuenow')) {
          return this.createInsertAttributesFix(
            document,
            diagnostic,
            ['aria-valuenow={0}', 'aria-valuemin={0}', 'aria-valuemax={100}'],
            'Add aria-valuenow/min/max attributes',
          );
        }
        if (msg.includes('aria-controls')) {
          return this.createInsertAttributesFix(
            document,
            diagnostic,
            ['aria-controls=""', 'aria-selected={false}'],
            'Add aria-controls and aria-selected',
          );
        }
        if (msg.includes('aria-selected')) {
          return this.createInsertAttributeFix(
            document,
            diagnostic,
            'aria-selected={false}',
            'Add aria-selected attribute',
          );
        }
        return null;
      }

      case 'heading-order': {
        const data = getDiagnosticData(document.uri, diagnostic);
        const msg = diagnostic.message;

        if (data?.type === 'skipped' && data.currentTag && data.previousLevel) {
          const suggestedLevel = parseInt(data.previousLevel, 10) + 1;
          if (suggestedLevel <= 6) {
            return this.createReplaceHeadingFix(document, diagnostic, data.currentTag, `h${suggestedLevel}`);
          }
        } else if (data?.type === 'multiple-h1') {
          return this.createReplaceHeadingFix(document, diagnostic, 'h1', 'h2');
        } else if (data?.type === 'first-heading' && data.currentTag) {
          return this.createReplaceHeadingFix(document, diagnostic, data.currentTag, 'h1');
        }

        // Regex fallback for diagnostics without structured data
        const currentTagMatch = msg.match(/<(h[1-6])>/);
        if (currentTagMatch && msg.includes('skipped')) {
          const prevMatch = msg.match(/follows `<h(\d)>/);
          if (prevMatch) {
            const suggestedLevel = parseInt(prevMatch[1], 10) + 1;
            if (suggestedLevel <= 6) {
              return this.createReplaceHeadingFix(document, diagnostic, currentTagMatch[1], `h${suggestedLevel}`);
            }
          }
        }
        if (msg.includes('Multiple') && msg.includes('<h1>')) {
          return this.createReplaceHeadingFix(document, diagnostic, 'h1', 'h2');
        }
        if (msg.includes('First heading') && currentTagMatch) {
          return this.createReplaceHeadingFix(document, diagnostic, currentTagMatch[1], 'h1');
        }
        return null;
      }

      case 'aria-role': {
        const data = getDiagnosticData(document.uri, diagnostic);
        const invalidRole = data?.invalidRole ?? diagnostic.message.match(/Invalid ARIA role "([^"]+)"/)?.[1];
        if (invalidRole) {
          const closest = findClosestRole(invalidRole);
          if (closest) {
            return this.createReplaceRoleValueFix(document, diagnostic, invalidRole, closest);
          }
        }
        return null;
      }

      case 'color-contrast': {
        const data = getDiagnosticData(document.uri, diagnostic);
        const fg = data?.foreground ?? diagnostic.message.match(/foreground: "([^"]+)"/)?.[1];
        const bg = data?.background ?? diagnostic.message.match(/background: "([^"]+)"/)?.[1];
        if (!fg || !bg) { return null; }

        // When opacity makes the contrast unfixable by color alone, remove opacity
        if (data?.opacityUnfixable === 'true') {
          return this.createRemoveStylePropertyFix(document, diagnostic, 'opacity', 'Remove opacity (no text color can fix contrast at this opacity level)');
        }

        // Tailwind class-based fix
        const fgClass = data?.fgClass;
        const suggestedFgClass = data?.suggestedFgClass;
        if (fgClass && suggestedFgClass) {
          return this.createReplaceTailwindColorFix(document, diagnostic, fgClass, suggestedFgClass);
        }

        // Inline style fix — use pre-computed suggestion from scanner (accounts for opacity)
        const fixedFg = data?.suggestedForeground ?? suggestAccessibleForeground(fg, bg);
        if (fixedFg) {
          return this.createReplaceColorFix(document, diagnostic, fg, fixedFg);
        }
        return null;
      }

      case 'nextjs-head-lang': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'lang="en"',
          'Add lang attribute',
        );
      }

      case 'nextjs-link-text': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'aria-label="TODO: describe link"',
          'Add aria-label to Next.js Link',
        );
      }

      case 'svg-has-accessible-name': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'aria-label="TODO: describe image"',
          'Add aria-label to SVG',
        );
      }

      case 'no-autofocus': {
        return this.createRemoveAttributeFix(
          document,
          diagnostic,
          'autoFocus',
          'Remove autoFocus attribute',
        );
      }

      case 'interactive-supports-focus': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'tabIndex={0}',
          'Add tabIndex={0} for keyboard focus',
        );
      }

      case 'no-noninteractive-element-interactions': {
        return this.createInsertAttributesFix(
          document,
          diagnostic,
          ['role="button"', 'tabIndex={0}'],
          'Add role and tabIndex for interactivity',
        );
      }

      case 'page-title': {
        // Derive a meaningful title from the filename (e.g. "about.tsx" → "About")
        const baseName = document.fileName.replace(/.*[/\\]/, '').replace(/\.(tsx?|jsx?)$/, '');
        const pageTitle = baseName
          .replace(/[-_]/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/\b\w/g, c => c.toUpperCase())
          || 'Page Title';
        return this.createInsertChildElementFix(
          document,
          diagnostic,
          `<title>${pageTitle}</title>`,
          'Add <title> to <Head>',
        );
      }

      case 'media-has-caption': {
        return this.createInsertChildElementFix(
          document,
          diagnostic,
          '<track kind="captions" src="" srcLang="en" label="English" />',
          'Add <track> captions to media element',
        );
      }

      case 'autocomplete-valid': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'autoComplete="off"',
          'Set autoComplete="off"',
        );
      }

      case 'label-has-associated-control': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'htmlFor="TODO: input-id"',
          'Add htmlFor attribute to <label>',
        );
      }

      case 'anchor-is-valid': {
        const msg = diagnostic.message;
        if (msg.includes('href')) {
          return this.createInsertAttributeFix(
            document,
            diagnostic,
            'href="#"',
            'Add href attribute to anchor',
          );
        }
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'aria-label="TODO: describe link"',
          'Add aria-label to anchor',
        );
      }

      case 'no-mouse-only-hover': {
        return this.createInsertAttributesFix(
          document,
          diagnostic,
          ['onFocus={() => {}}', 'onBlur={() => {}}'],
          'Add onFocus/onBlur to match mouse hover handlers',
        );
      }

      case 'no-target-blank-noopener': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'rel="noopener noreferrer"',
          'Add rel="noopener noreferrer"',
        );
      }

      case 'no-autoplay-media': {
        return this.createInsertAttributeFix(
          document,
          diagnostic,
          'muted',
          'Add muted attribute',
        );
      }

      default:
        return null;
    }
  }

  private createInsertChildElementFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    childElement: string,
    title: string,
  ): vscode.CodeAction | null {
    const fix = new vscode.CodeAction(
      `Accessify: ${title}`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];

    const tagLine = diagnostic.range.start.line;
    const tagStart = diagnostic.range.start.character;
    const lineText = document.lineAt(tagLine).text;
    const parentIndent = lineText.match(/^(\s*)/)?.[1] ?? '';
    const childIndent = parentIndent + '  ';

    const edit = new vscode.WorkspaceEdit();

    const closeIdx = findOpeningTagClose(lineText, tagStart);
    if (closeIdx !== -1) {
      edit.insert(document.uri, new vscode.Position(tagLine, closeIdx + 1), `\n${childIndent}${childElement}`);
      fix.edit = edit;
      fix.isPreferred = true;
      return fix;
    }

    const multiline = findOpeningTagCloseMultiline(document, tagLine, tagStart);
    if (multiline) {
      edit.insert(document.uri, new vscode.Position(multiline.line, multiline.column + 1), `\n${childIndent}${childElement}`);
      fix.edit = edit;
      fix.isPreferred = true;
      return fix;
    }

    return null;
  }

  private createRemoveStylePropertyFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    property: string,
    title: string,
  ): vscode.CodeAction | null {
    const startLine = diagnostic.range.start.line;
    const searchLimit = Math.min(startLine + 30, document.lineCount - 1);
    const propPattern = new RegExp(`^(\\s*)${escapeRegExp(property)}\\s*:[^,}\\n]+,?\\s*$`);

    for (let i = startLine; i <= searchLimit; i++) {
      const lineText = document.lineAt(i).text;
      if (propPattern.test(lineText)) {
        const fix = new vscode.CodeAction(`Accessify: ${title}`, vscode.CodeActionKind.QuickFix);
        fix.diagnostics = [diagnostic];
        const edit = new vscode.WorkspaceEdit();
        edit.delete(document.uri, new vscode.Range(i, 0, i + 1, 0));
        fix.edit = edit;
        fix.isPreferred = true;
        return fix;
      }
    }
    return null;
  }

  private createInsertAttributeFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    attribute: string,
    title: string,
  ): vscode.CodeAction | null {
    const attrName = extractAttrName(attribute);
    const tagStart = diagnostic.range.start.character;
    if (tagAlreadyHasAttribute(document, diagnostic.range.start.line, tagStart, attrName)) {
      return null;
    }

    const fix = new vscode.CodeAction(
      `Accessify: ${title}`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];

    const line = document.lineAt(diagnostic.range.start.line);
    const lineText = line.text;
    const insertIndex = findOpeningTagClose(lineText, tagStart);

    const edit = new vscode.WorkspaceEdit();
    if (insertIndex !== -1) {
      const insertPosition = new vscode.Position(diagnostic.range.start.line, insertIndex);
      edit.insert(document.uri, insertPosition, ` ${attribute}`);
      fix.edit = edit;
    } else {
      // Multiline tag — scan forward to find the closing > or />
      const multiline = findOpeningTagCloseMultiline(document, diagnostic.range.start.line, tagStart);
      if (multiline) {
        const closingLineText = document.lineAt(multiline.line).text;
        const beforeClose = closingLineText.substring(0, multiline.column).trim();
        if (beforeClose === '' || beforeClose === '/') {
          // > or /> on its own line — insert attribute on a new line before it
          const propIndent = detectPropIndentation(document, diagnostic.range.start.line, multiline.line);
          const insertPosition = new vscode.Position(multiline.line, 0);
          edit.insert(document.uri, insertPosition, `${propIndent}${attribute}\n`);
        } else {
          const insertPosition = new vscode.Position(multiline.line, multiline.column);
          edit.insert(document.uri, insertPosition, ` ${attribute}`);
        }
        fix.edit = edit;
      }
    }

    fix.isPreferred = true;
    return fix;
  }

  private createRemoveAttributeFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    attrName: string,
    title: string,
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(
      `Accessify: ${title}`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];
    const edit = new vscode.WorkspaceEdit();
    const line = diagnostic.range.start.line;
    const lineText = document.lineAt(line).text;
    const pattern = new RegExp(`\\s*${escapeRegExp(attrName)}(?:=\\{[^}]*\\}|="[^"]*"|='[^']*')?`);
    const replaced = lineText.replace(pattern, '');
    if (replaced !== lineText) {
      const range = new vscode.Range(line, 0, line, lineText.length);
      edit.replace(document.uri, range, replaced);
      fix.edit = edit;
    }
    fix.isPreferred = true;
    return fix;
  }

  private createInsertAttributesFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    attributes: string[],
    title: string,
  ): vscode.CodeAction | null {
    const tagStart = diagnostic.range.start.character;
    const missing = attributes.filter(
      attr => !tagAlreadyHasAttribute(document, diagnostic.range.start.line, tagStart, extractAttrName(attr)),
    );
    if (missing.length === 0) { return null; }

    const fix = new vscode.CodeAction(
      `Accessify: ${title}`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];

    const line = document.lineAt(diagnostic.range.start.line);
    const lineText = line.text;
    const insertIndex = findOpeningTagClose(lineText, tagStart);

    const edit = new vscode.WorkspaceEdit();
    if (insertIndex !== -1) {
      const insertPosition = new vscode.Position(diagnostic.range.start.line, insertIndex);
      edit.insert(document.uri, insertPosition, ` ${missing.join(' ')}`);
      fix.edit = edit;
    } else {
      const multiline = findOpeningTagCloseMultiline(document, diagnostic.range.start.line, tagStart);
      if (multiline) {
        const closingLineText = document.lineAt(multiline.line).text;
        const beforeClose = closingLineText.substring(0, multiline.column).trim();
        if (beforeClose === '' || beforeClose === '/') {
          const propIndent = detectPropIndentation(document, diagnostic.range.start.line, multiline.line);
          const insertPosition = new vscode.Position(multiline.line, 0);
          const attrText = missing.map(a => `${propIndent}${a}\n`).join('');
          edit.insert(document.uri, insertPosition, attrText);
        } else {
          const insertPosition = new vscode.Position(multiline.line, multiline.column);
          edit.insert(document.uri, insertPosition, ` ${missing.join(' ')}`);
        }
        fix.edit = edit;
      }
    }

    return fix;
  }

  /**
   * Try to infer a label for an IconButton from its child icon element.
   * Scans lines after the opening tag for patterns like `<Close .../>`, `<EditIcon .../>`,
   * and converts the PascalCase name into a readable label ("Close", "Edit").
   */
  private inferIconLabel(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): string | null {
    const startLine = diagnostic.range.start.line;
    const maxLine = Math.min(startLine + 10, document.lineCount - 1);

    for (let i = startLine; i <= maxLine; i++) {
      const text = document.lineAt(i).text;
      // Match self-closing JSX children like <Close />, <EditIcon />, <ArrowBack fontSize="small" />
      const iconMatch = text.match(/<([A-Z][a-zA-Z]*?)(?:Icon)?\s+[^>]*\/>/);
      if (iconMatch) {
        // Convert PascalCase to words: "ArrowBack" → "Arrow Back" → "Arrow back"
        const raw = iconMatch[1].replace(/([a-z])([A-Z])/g, '$1 $2');
        return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      }
      // Also match <Close /> with no extra props
      const simpleMatch = text.match(/<([A-Z][a-zA-Z]*?)(?:Icon)?\s*\/>/);
      if (simpleMatch) {
        const raw = simpleMatch[1].replace(/([a-z])([A-Z])/g, '$1 $2');
        return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      }
    }
    return null;
  }

  private createReplaceHeadingFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    currentTag: string,
    suggestedTag: string,
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(
      `Accessify: Change <${currentTag}> to <${suggestedTag}>`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    const lineNum = diagnostic.range.start.line;
    const lineText = document.lineAt(lineNum).text;

    const openIdx = lineText.indexOf(`<${currentTag}`);
    if (openIdx !== -1) {
      const openRange = new vscode.Range(lineNum, openIdx + 1, lineNum, openIdx + 1 + currentTag.length);
      edit.replace(document.uri, openRange, suggestedTag);
    }

    const closeIdx = lineText.indexOf(`</${currentTag}>`);
    if (closeIdx !== -1) {
      const closeRange = new vscode.Range(lineNum, closeIdx + 2, lineNum, closeIdx + 2 + currentTag.length);
      edit.replace(document.uri, closeRange, suggestedTag);
    }

    fix.edit = edit;
    fix.isPreferred = true;
    return fix;
  }

  private createReplaceRoleValueFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    invalidRole: string,
    suggestedRole: string,
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(
      `Accessify: Replace role="${invalidRole}" with "${suggestedRole}"`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    const lineNum = diagnostic.range.start.line;
    const lineText = document.lineAt(lineNum).text;
    const idx = lineText.indexOf(`"${invalidRole}"`);
    if (idx !== -1) {
      const range = new vscode.Range(lineNum, idx + 1, lineNum, idx + 1 + invalidRole.length);
      edit.replace(document.uri, range, suggestedRole);
    }
    fix.edit = edit;
    fix.isPreferred = true;
    return fix;
  }

  private createReplaceColorFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    originalColor: string,
    fixedColor: string,
  ): vscode.CodeAction | null {
    const fix = new vscode.CodeAction(
      `Accessify: Adjust foreground color to "${fixedColor}" for contrast`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    const diagLine = diagnostic.range.start.line;
    // Scan the entire tag span — color: property may be on a different line in multiline style objects
    const tagSpan = findJsxOpeningTagSpan(document, diagLine, diagnostic.range.start.character);
    const colorPattern = new RegExp(`(color:\\s*["'])${escapeRegExp(originalColor)}(["'])`, 'i');

    for (let i = tagSpan.startLine; i <= tagSpan.endLine; i++) {
      const lineText = document.lineAt(i).text;
      const match = lineText.match(colorPattern);
      if (match && match.index !== undefined) {
        const valueStart = match.index + match[1].length;
        edit.replace(document.uri, new vscode.Range(i, valueStart, i, valueStart + originalColor.length), fixedColor);
        fix.edit = edit;
        fix.isPreferred = true;
        return fix;
      }
    }
    return null;
  }

  private createReplaceTailwindColorFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    originalClass: string,
    suggestedClass: string,
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(
      `Accessify: Replace "${originalClass}" with "${suggestedClass}" for contrast`,
      vscode.CodeActionKind.QuickFix,
    );
    fix.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    const lineNum = diagnostic.range.start.line;
    const tagSpan = findJsxOpeningTagSpan(document, lineNum, diagnostic.range.start.character);

    // Search the tag span for the Tailwind class
    for (let i = tagSpan.startLine; i <= tagSpan.endLine; i++) {
      const lineText = document.lineAt(i).text;
      const idx = lineText.indexOf(originalClass);
      if (idx !== -1) {
        const range = new vscode.Range(i, idx, i, idx + originalClass.length);
        edit.replace(document.uri, range, suggestedClass);
        break;
      }
    }

    fix.edit = edit;
    fix.isPreferred = true;
    return fix;
  }
}

/** Command handler: generates an AI fix and shows a diff preview. */
export async function applyAiFixCommand(uri: vscode.Uri, diagnostic: vscode.Diagnostic): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const diagLine = diagnostic.range.start.line;
  const diagCol = diagnostic.range.start.character;

  const tagSpan = findJsxOpeningTagSpan(document, diagLine, diagCol);
  const spanStartLine = tagSpan.startLine;
  let spanEndLine = tagSpan.endLine;
  const tagLines: string[] = [];
  for (let i = spanStartLine; i <= spanEndLine; i++) {
    tagLines.push(document.lineAt(i).text);
  }
  let tagText = tagLines.join('\n');

  const ctxStart = Math.max(0, tagSpan.startLine - 5);
  const ctxEnd = Math.min(document.lineCount - 1, tagSpan.endLine + 10);
  const contextLines: string[] = [];
  for (let i = ctxStart; i <= ctxEnd; i++) {
    contextLines.push(document.lineAt(i).text);
  }
  const surroundingContext = contextLines.join('\n');

  const issue = {
    message: diagnostic.message,
    rule: getRuleId(diagnostic),
    severity: 'warning' as const,
    line: diagnostic.range.start.line,
    column: diagnostic.range.start.character,
    snippet: tagText,
  };

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Accessify: Generating AI fix...',
      cancellable: true,
    },
    async (_progress, token) => {
      // Wire VS Code cancellation token to an AbortController
      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      const fix = await getAiFix(tagText, issue, surroundingContext, abortController.signal);
      if (!fix || token.isCancellationRequested) {
        return;
      }

      const ruleId = getRuleId(diagnostic);
      const wcagTags = getWcagTags(ruleId);
      const helpUrl = getHelpUrl(ruleId);

      let finalReplacement: string | null = null;
      let finalExplanation = fix.explanation;

      // 1. Preferred: apply structured actions (deterministic, no formatting issues)
      if (fix.actions && fix.actions.length > 0) {
        // If any action is replaceTag, expand the span to include the closing tag
        const replaceTagAction = fix.actions.find(a => a.type === 'replaceTag');
        if (replaceTagAction && replaceTagAction.type === 'replaceTag') {
          const oldTag = replaceTagAction.oldTag;
          const closePattern = `</${oldTag}>`;
          // Search forward from the opening tag's end to find the closing tag
          for (let i = spanEndLine; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            if (lineText.includes(closePattern)) {
              // Expand tagText and span to include everything up to and including the closing tag
              const extraLines: string[] = [];
              for (let j = spanEndLine + 1; j <= i; j++) {
                extraLines.push(document.lineAt(j).text);
              }
              if (extraLines.length > 0) {
                tagText = tagText + '\n' + extraLines.join('\n');
                spanEndLine = i;
              }
              break;
            }
          }
        }

        finalReplacement = applyActions(tagText, fix.actions);
        if (!finalReplacement || finalReplacement.trim() === tagText.trim()) {
          finalReplacement = null; // actions failed or no change, try next
        }
        // Reject if actions broke attribute syntax
        if (finalReplacement && hasAttributeSyntaxBreak(tagText, finalReplacement)) {
          finalReplacement = null;
        }
        // Reject if actions fabricated attributes not in original code
        if (finalReplacement && findFabricatedAttribute(tagText, finalReplacement)) {
          finalReplacement = null;
        }
      }

      // 2. Fallback: use fixedCode with post-processing
      if (!finalReplacement && fix.fixedCode) {
        const safeReplacement = computeSafeReplacement(tagText, fix.fixedCode);
        const noChange = safeReplacement.trim() === tagText.trim();
        let invalidJsx = false;
        if (!noChange) {
          const syntaxCheck = validateJsxSyntax(safeReplacement);
          invalidJsx = !syntaxCheck.valid;
        }
        if (!noChange && !invalidJsx && !hasAttributeSyntaxBreak(tagText, safeReplacement) && !findFabricatedAttribute(tagText, safeReplacement)) {
          finalReplacement = safeReplacement;
        }
      }

      // 3. Last resort: static fix attribute insertion
      if (!finalReplacement) {
        const staticAttr = getStaticFixAttribute(ruleId, diagnostic);
        if (staticAttr) {
          const staticResult = insertAttributeIntoTag(tagText, staticAttr);
          if (staticResult && staticResult.trim() !== tagText.trim()) {
            finalReplacement = staticResult;
            finalExplanation = `Add \`${staticAttr}\``;
          }
        }
      }

      if (!finalReplacement) {
        return;
      }

      const validation = validateFix(ruleId, tagText, finalReplacement);

      const reasoningParts = [fix.reasoning];
      if (wcagTags.length > 0) { reasoningParts.push(`WCAG: ${wcagTags.join(', ')}`); }
      if (helpUrl) { reasoningParts.push(`Ref: ${helpUrl}`); }
      if (validation.notes.length > 0) { reasoningParts.push(`Validation: ${validation.notes.join('; ')}`); }

      const change: A11yChange = {
        id: 1,
        startLine: spanStartLine + 1,
        endLine: spanEndLine + 1,
        original: tagText,
        replacement: finalReplacement,
        explanation: finalExplanation,
        rule: ruleId,
        confidence: validation.adjustedConfidence,
        reasoning: reasoningParts.filter(Boolean).join(' | '),
      };

      const result: FullFileFixResult = {
        changes: [change],
        designSystemDetected: null,
      };

      DiffPreviewPanel.createOrShow(uri, result);
    },
  );
}

export async function bulkFixFileCommand(): Promise<void> {
  const document = await resolveActiveDocument();
  if (!document) {
    vscode.window.showWarningMessage('Accessify: No TSX, JSX, or HTML file is open.');
    return;
  }

  const uri = document.uri;
  const diagnostics = await scanFileToDiagnostics(document);

  if (diagnostics.length === 0) {
    vscode.window.showInformationMessage('Accessify: No accessibility issues found in this file.');
    return;
  }

  const entry = buildChangesForFile(document, uri, diagnostics);

  if (!entry || entry.changes.length === 0) {
    vscode.window.showInformationMessage('Accessify: No auto-fixable issues in this file.');
    return;
  }

  BulkFixPreviewPanel.createOrShow({ files: [entry] });
}

export async function bulkFixWorkspaceCommand(): Promise<void> {
  const excludePattern = '{**/node_modules/**,**/.env*,**/config/**,/**/*.config.*,**/*.test.*,**/*.spec.*,**/__tests__/**,**/__mocks__/**,**/test/**,**/tests/**,**/*.stories.*,**/coverage/**,**/dist/**,**/build/**}';
  const fileUris = await vscode.workspace.findFiles('**/*.{tsx,jsx,html}', excludePattern);
  if (fileUris.length === 0) {
    vscode.window.showInformationMessage('Accessify: No TSX/JSX/HTML files found in workspace.');
    return;
  }

  const { loadConfig: loadA11yConfig, isExcluded: checkExcluded } = await import('./config');
  const a11yConfig = await loadA11yConfig();
  const eligibleUris = fileUris.filter(uri => !checkExcluded(a11yConfig, uri.fsPath));

  const entries: BulkFixFileEntry[] = [];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Accessify: Static Fix Workspace', cancellable: true },
    async (progress, token) => {
      const total = eligibleUris.length;
      let completed = 0;

      for (const fileUri of eligibleUris) {
        if (token.isCancellationRequested) { break; }
        try {
          const document = await vscode.workspace.openTextDocument(fileUri);
          const diagnostics = await scanFileToDiagnostics(document);
          if (diagnostics.length > 0) {
            const entry = buildChangesForFile(document, fileUri, diagnostics);
            if (entry && entry.changes.length > 0) { entries.push(entry); }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[Accessify] Skipping unreadable file ${fileUri.fsPath}: ${msg}`);
        }
        completed++;
        progress.report({ increment: (1 / total) * 100, message: `${completed}/${total} files scanned` });
      }
    },
  );

  if (entries.length === 0) {
    vscode.window.showInformationMessage('Accessify: No auto-fixable issues found across the workspace.');
    return;
  }

  const totalChanges = entries.reduce((sum, e) => sum + e.changes.length, 0);
  BulkFixPreviewPanel.createOrShow({ files: entries });
  vscode.window.showInformationMessage(`Accessify: Found ${totalChanges} static fix(es) across ${entries.length} file(s).`);
}

/**
 * Extracts the rule string from a diagnostic's code.
 */
function extractRuleCode(diagnostic: vscode.Diagnostic): string | undefined {
  const code = diagnostic.code;
  if (typeof code === 'string') { return code; }
  if (typeof code === 'number') { return String(code); }
  if (code && typeof code === 'object' && 'value' in code) {
    return String(code.value);
  }
  return undefined;
}

/**
 * Scan a document using the AST scanner and return VS Code Diagnostics.
 */
async function scanFileToDiagnostics(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  const config = await loadConfig();
  let issues = scanForA11yIssues(document.getText(), document.fileName);
  issues = applyConfig(config, issues);

  return issues.map(issue => {
    const startPos = new vscode.Position(issue.line, issue.column);
    const endPos = issue.endLine !== undefined && issue.endColumn !== undefined
      ? new vscode.Position(issue.endLine, issue.endColumn)
      : document.lineAt(issue.line).range.end;
    const range = new vscode.Range(startPos, endPos);
    const diagnostic = new vscode.Diagnostic(range, issue.message, toVscodeSeverity(issue.severity));
    diagnostic.source = 'Accessify';
    const helpUrl = getHelpUrl(issue.rule);
    if (helpUrl) {
      diagnostic.code = { value: issue.rule, target: vscode.Uri.parse(helpUrl) };
    } else {
      diagnostic.code = issue.rule;
    }
    return diagnostic;
  });
}

/**
 * Builds preview changes for a single file from its diagnostics.
 */
function buildChangesForFile(
  document: vscode.TextDocument,
  uri: vscode.Uri,
  diagnostics: vscode.Diagnostic[],
): BulkFixFileEntry | null {
  const filtered = diagnostics.filter(d => {
    const rule = extractRuleCode(d);
    if (!rule) { return false; }
    if (getStaticFixAttribute(rule, d) !== null) { return true; }
    const lineText = document.lineAt(d.range.start.line).text;
    return getStaticFixReplacement(rule, d, lineText, document) !== null;
  });

  if (filtered.length === 0) { return null; }

  const changes: A11yChange[] = [];
  let nextId = 1;

  for (const diagnostic of filtered) {
    const rule = extractRuleCode(diagnostic);
    if (!rule) { continue; }

    const lineNum = diagnostic.range.start.line;
    const lineText = document.lineAt(lineNum).text;

    // Try attribute insertion first
    const attribute = getStaticFixAttribute(rule, diagnostic);
    if (attribute) {
      const tagStart = diagnostic.range.start.character;

      const attrName = extractAttrName(attribute);
      if (tagAlreadyHasAttribute(document, lineNum, tagStart, attrName)) {
        continue;
      }

      const insertIndex = findOpeningTagClose(lineText, tagStart);

      const riskContext = rule === 'aria-pattern' ? diagnostic.message : undefined;
      const risk = getStaticFixRisk(rule, riskContext);
      const wcagTags = getWcagTags(rule);
      const reasoningParts = [risk.reasoning];
      if (wcagTags.length > 0) { reasoningParts.push(`WCAG: ${wcagTags.join(', ')}`); }
      if (risk.caveat) { reasoningParts.push(`Caveat: ${risk.caveat}`); }
      const fullReasoning = reasoningParts.join(' | ');

      if (insertIndex !== -1) {
        changes.push({
          id: nextId++, startLine: lineNum + 1, endLine: lineNum + 1,
          original: lineText,
          replacement: lineText.substring(0, insertIndex) + ` ${attribute}` + lineText.substring(insertIndex),
          explanation: `Add \`${attribute}\` to fix ${rule}`,
          rule, confidence: risk.confidence, reasoning: fullReasoning,
        });
      } else {
        const multiline = findOpeningTagCloseMultiline(document, lineNum, tagStart);
        if (multiline) {
          const closingLineText = document.lineAt(multiline.line).text;
          const targetLine = multiline.line;
          const targetText = targetLine === lineNum ? lineText : closingLineText;
          const beforeClose = closingLineText.substring(0, multiline.column).trim();

          let replacement: string;
          if (beforeClose === '' || beforeClose === '/') {
            // > or /> on its own line — insert attribute on a new line before it
            const propIndent = detectPropIndentation(document, lineNum, multiline.line);
            replacement = `${propIndent}${attribute}\n${targetText}`;
          } else {
            replacement = targetText.substring(0, multiline.column) + ` ${attribute}` + targetText.substring(multiline.column);
          }

          changes.push({
            id: nextId++, startLine: targetLine + 1, endLine: targetLine + 1,
            original: targetText,
            replacement,
            explanation: `Add \`${attribute}\` to fix ${rule}`,
            rule, confidence: risk.confidence, reasoning: fullReasoning,
          });
        }
      }
      continue;
    }

    // Try full line replacement (heading-order, aria-role, color-contrast)
    const lineReplacement = getStaticFixReplacement(rule, diagnostic, lineText, document);
    if (lineReplacement) {
      const repRiskCtx = rule === 'heading-order' && diagnostic.message.includes('Multiple') ? 'multiple-h1' : undefined;
      const repRisk = getStaticFixRisk(rule, repRiskCtx);
      const repWcag = getWcagTags(rule);
      const repReasoningParts = [repRisk.reasoning];
      if (repWcag.length > 0) { repReasoningParts.push(`WCAG: ${repWcag.join(', ')}`); }
      if (repRisk.caveat) { repReasoningParts.push(`Caveat: ${repRisk.caveat}`); }
      // A static fix may span multiple lines (e.g. changing both the opening and
      // closing tag of a multiline element).
      let fixStart: number;
      let fixEnd: number;
      let fixOriginal: string;
      if (lineReplacement.spanStart != null && lineReplacement.spanEnd != null) {
        fixStart = lineReplacement.spanStart;
        fixEnd = lineReplacement.spanEnd;
        fixOriginal = lineReplacement.original
          ?? document.getText(new vscode.Range(fixStart, 0, fixEnd, document.lineAt(fixEnd).text.length));
      } else if (lineReplacement.targetLine != null) {
        fixStart = lineReplacement.targetLine;
        fixEnd = lineReplacement.targetLine;
        fixOriginal = document.lineAt(lineReplacement.targetLine).text;
      } else {
        fixStart = lineNum;
        fixEnd = lineNum;
        fixOriginal = lineText;
      }
      changes.push({
        id: nextId++, startLine: fixStart + 1, endLine: fixEnd + 1,
        original: fixOriginal, replacement: lineReplacement.replacement,
        explanation: lineReplacement.explanation, rule,
        confidence: repRisk.confidence, reasoning: repReasoningParts.join(' | '),
      });
    }
  }

  if (changes.length === 0) { return null; }
  return { uri, relativePath: vscode.workspace.asRelativePath(uri), changes };
}

/**
 * Returns the attribute string to insert for a given rule, or null if no static fix exists.
 */
function getStaticFixAttribute(ruleId: string, diagnostic: vscode.Diagnostic): string | null {
  switch (ruleId) {
    case 'img-alt': return 'alt=""';
    case 'button-label': return 'aria-label="TODO: describe action"';
    case 'form-label': return 'aria-label="TODO: describe input"';
    case 'click-events-have-key-events':
      return 'role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { /* handler */ } }}';
    case 'nextjs-head-lang': return 'lang="en"';
    case 'nextjs-link-text': return 'aria-label="TODO: describe link"';
    case 'autocomplete-valid': return 'autoComplete="name"';
    case 'no-mouse-only-hover': return 'onFocus={() => {}}';
    case 'svg-has-accessible-name': return 'aria-label="TODO: describe image"';
    case 'interactive-supports-focus': return 'tabIndex={0}';
    case 'no-noninteractive-element-interactions': return 'role="button" tabIndex={0}';
    case 'no-target-blank-noopener': return 'rel="noopener noreferrer"';
    case 'no-autoplay-media': return 'muted';
    case 'aria-pattern': {
      const msg = diagnostic.message;
      if (msg.includes('aria-labelledby') || msg.includes('aria-label')) { return 'aria-label="TODO: describe element"'; }
      if (msg.includes('aria-expanded')) { return 'aria-expanded={false}'; }
      if (msg.includes('aria-checked')) { return 'aria-checked={false}'; }
      if (msg.includes('aria-valuenow')) { return 'aria-valuenow={0} aria-valuemin={0} aria-valuemax={100}'; }
      if (msg.includes('aria-controls')) { return 'aria-controls="TODO: target-id" aria-selected={false}'; }
      if (msg.includes('aria-selected')) { return 'aria-selected={false}'; }
      return null;
    }
    default: return null;
  }
}

/**
 * Returns a full line replacement for rules that need more than attribute insertion.
 */
function getStaticFixReplacement(
  ruleId: string,
  diagnostic: vscode.Diagnostic,
  lineText: string,
  document?: vscode.TextDocument,
): { replacement: string; explanation: string; targetLine?: number; spanStart?: number; spanEnd?: number; original?: string } | null {
  switch (ruleId) {
    case 'heading-order': {
      const msg = diagnostic.message;
      const currentTagMatch = msg.match(/<(h[1-6])>/);
      let currentTag: string | null = null;
      let targetTag: string | null = null;

      if (currentTagMatch && msg.includes('skipped')) {
        const prevMatch = msg.match(/follows `<h(\d)>/);
        if (prevMatch) {
          const suggested = parseInt(prevMatch[1], 10) + 1;
          if (suggested <= 6) { currentTag = currentTagMatch[1]; targetTag = `h${suggested}`; }
        }
      } else if (msg.includes('Multiple') && msg.includes('<h1>')) {
        currentTag = 'h1'; targetTag = 'h2';
      } else if (msg.includes('First heading') && currentTagMatch) {
        currentTag = currentTagMatch[1]; targetTag = 'h1';
      }

      if (currentTag && targetTag) {
        let replacement = lineText;
        replacement = replacement.replace(
          new RegExp(`<${escapeRegExp(currentTag)}(\\s|>|/>)`), `<${targetTag}$1`,
        );
        replacement = replacement.replace(
          new RegExp(`</${escapeRegExp(currentTag)}>`), `</${targetTag}>`,
        );
        if (replacement !== lineText) {
          return { replacement, explanation: `Change <${currentTag}> to <${targetTag}>` };
        }
      }
      return null;
    }
    case 'aria-role': {
      const roleMatch = diagnostic.message.match(/Invalid ARIA role "([^"]+)"/);
      if (roleMatch) {
        const invalidRole = roleMatch[1];
        const closest = findClosestRole(invalidRole);
        if (closest) {
          const replacement = lineText.replace(`"${invalidRole}"`, `"${closest}"`);
          if (replacement !== lineText) {
            return { replacement, explanation: `Replace invalid role "${invalidRole}" with "${closest}"` };
          }
        }
      }
      return null;
    }
    case 'color-contrast': {
      const fgMatch = diagnostic.message.match(/foreground: "([^"]+)"/);
      const bgMatch = diagnostic.message.match(/background: "([^"]+)"/);
      if (!fgMatch || !bgMatch) { return null; }

      // Try Tailwind class replacement first
      const twClassMatch = diagnostic.message.match(/replace "([^"]+)" with "([^"]+)"/);
      if (twClassMatch) {
        // First try on the diagnostic line itself
        const replacement = lineText.replace(twClassMatch[1], twClassMatch[2]);
        if (replacement !== lineText) {
          return { replacement, explanation: `Replace "${twClassMatch[1]}" with "${twClassMatch[2]}" for sufficient contrast` };
        }
        // Search nearby lines (className may be on a different line of the same element)
        if (document) {
          const startLine = diagnostic.range.start.line;
          const searchRadius = 10;
          for (let offset = 1; offset <= searchRadius; offset++) {
            const candidateLine = startLine + offset;
            if (candidateLine >= document.lineCount) { break; }
            const candidateText = document.lineAt(candidateLine).text;
            if (candidateText.includes(twClassMatch[1])) {
              const fixedLine = candidateText.replace(twClassMatch[1], twClassMatch[2]);
              return { replacement: fixedLine, explanation: `Replace "${twClassMatch[1]}" with "${twClassMatch[2]}" for sufficient contrast`, targetLine: candidateLine };
            }
          }
        }
      }

      // Inline style fix
      const fixedFg = suggestAccessibleForeground(fgMatch[1], bgMatch[1]);
      if (fixedFg) {
        const colorPattern = new RegExp(
          `(color:\\s*["'])${escapeRegExp(fgMatch[1])}(["'])`, 'i',
        );
        const replacement = lineText.replace(colorPattern, `$1${fixedFg}$2`);
        if (replacement !== lineText) {
          return { replacement, explanation: `Adjust foreground color to "${fixedFg}" for sufficient contrast` };
        }
      }
      return null;
    }
    case 'no-autofocus': {
      const replacement = lineText.replace(/\s*autoFocus(?:=\{[^}]*\}|="[^"]*"|='[^']*')?/, '');
      if (replacement !== lineText) {
        return { replacement, explanation: 'Remove autoFocus attribute' };
      }
      return null;
    }
    default: return null;
  }
}

