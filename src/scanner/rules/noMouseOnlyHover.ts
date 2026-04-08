import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: no-mouse-only-hover
 * WCAG 1.4.13 — Content that appears on hover must also be accessible via
 * keyboard focus. Elements with onMouseEnter/onMouseOver should have a
 * corresponding onFocus handler.
 */
export function checkNoMouseOnlyHover(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const attrs = node.attributes.properties;

  const hasMouseEnter = attrs.some(attr =>
    ts.isJsxAttribute(attr) && (
      attr.name.getText(sourceFile) === 'onMouseEnter' ||
      attr.name.getText(sourceFile) === 'onMouseOver'
    ),
  );

  if (!hasMouseEnter) { return issues; }

  const hasFocus = attrs.some(attr =>
    ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'onFocus',
  );

  if (!hasFocus) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: 'Element has `onMouseEnter`/`onMouseOver` but no `onFocus`. Hover content must also be keyboard-accessible (WCAG 1.4.13).',
      rule: 'no-mouse-only-hover',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
  }

  return issues;
}
