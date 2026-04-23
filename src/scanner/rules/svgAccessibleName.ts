import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { hasSpreadProps, hasAttr, getAttrStringValue, isAriaHidden } from './jsxHelpers';

/**
 * Rule: svg-has-accessible-name
 * WCAG 1.1.1 — Inline `<svg>` elements must have an accessible name
 * via `<title>`, `aria-label`, `aria-labelledby`, or `role="img"` with
 * a label. SVGs without accessible names are invisible to screen readers.
 *
 * Skips:
 *  - `aria-hidden="true"` / `role="presentation"` / `role="none"` (decorative)
 *  - Spread props (may carry labels dynamically)
 */
export function checkSvgAccessibleName(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const tagName = node.tagName.getText(sourceFile).toLowerCase();
  if (tagName !== 'svg') { return issues; }

  // Decorative SVGs don't need names
  if (isAriaHidden(node, sourceFile)) { return issues; }

  // Spread props may carry labels
  if (hasSpreadProps(node)) { return issues; }

  // Check for aria-label or aria-labelledby
  const ariaLabel = getAttrStringValue(node, 'aria-label', sourceFile);
  if (ariaLabel !== undefined && ariaLabel.trim().length > 0) { return issues; }
  if (ariaLabel === undefined && hasAttr(node, 'aria-label', sourceFile)) { return issues; }
  if (hasAttr(node, 'aria-labelledby', sourceFile)) { return issues; }

  // Check for <title> child
  if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
    const hasTitleChild = node.parent.children.some(child => {
      if (ts.isJsxElement(child)) {
        const childTag = child.openingElement.tagName.getText(sourceFile).toLowerCase();
        if (childTag === 'title') {
          // Ensure <title> has text content
          return child.children.some(c =>
            ts.isJsxText(c) && c.getText(sourceFile).trim().length > 0,
          );
        }
      }
      return false;
    });
    if (hasTitleChild) { return issues; }
  }

  // Check for role="img" — valid but still needs aria-label (already checked above)
  const role = getAttrStringValue(node, 'role', sourceFile);
  if (role === 'img') {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: '`<svg role="img">` must have an `aria-label` or `aria-labelledby` attribute for screen readers (WCAG 1.1.1).',
      rule: 'svg-has-accessible-name',
      severity: 'error',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
    return issues;
  }

  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  issues.push({
    message: 'Inline `<svg>` must have an accessible name. Add a `<title>` child, `aria-label`, or `aria-labelledby`. For decorative SVGs, add `aria-hidden="true"` (WCAG 1.1.1).',
    rule: 'svg-has-accessible-name',
    severity: 'warning',
    line,
    column: character,
    snippet: node.getText(sourceFile),
  });

  return issues;
}
