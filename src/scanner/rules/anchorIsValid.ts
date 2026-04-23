import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { hasSpreadProps } from './jsxHelpers';

/**
 * Rule: anchor-is-valid
 * WCAG 2.4.4 — Anchors must have a real destination. `href="#"`, `href="javascript:void(0)"`,
 * or missing `href` on an `<a>` are anti-patterns — use a `<button>` for actions instead.
 *
 * Spread props: When `{...props}` is present, `href` may be provided
 * dynamically — suppresses "missing href" to avoid false positives.
 */
const INVALID_HREFS = new Set(['#', '#!', 'javascript:void(0)', 'javascript:void(0);', 'javascript:;', 'javascript:']);

export function checkAnchorIsValid(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const tagName = node.tagName.getText(sourceFile);
  if (tagName !== 'a') { return issues; }

  const attrs = node.attributes.properties;
  let hrefValue: string | undefined;
  let hrefFound = false;

  for (const attr of attrs) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText(sourceFile) !== 'href') { continue; }
    hrefFound = true;
    if (!attr.initializer) {
      hrefValue = '';
    } else if (ts.isStringLiteral(attr.initializer)) {
      hrefValue = attr.initializer.text;
    } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression && ts.isStringLiteral(attr.initializer.expression)) {
      hrefValue = attr.initializer.expression.text;
    }
    break;
  }

  if (!hrefFound) {
    // Spread props may carry href dynamically — suppress to avoid false positives
    if (hasSpreadProps(node)) { return issues; }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: 'Anchor element is missing `href` attribute. If this is an action, use a `<button>` instead.',
      rule: 'anchor-is-valid',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
    return issues;
  }

  if (hrefValue !== undefined && INVALID_HREFS.has(hrefValue.trim())) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: `Anchor has \`href="${hrefValue}"\` which is not a real navigation target. Use a \`<button>\` for actions (WCAG 2.4.4).`,
      rule: 'anchor-is-valid',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
  }

  return issues;
}
