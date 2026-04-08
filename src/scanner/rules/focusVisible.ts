import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: focus-visible
 * WCAG 2.4.7 — Elements must not suppress focus indicators via inline styles
 * (outline: none / outline: 0) without providing an alternative.
 */
export function checkFocusVisible(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxAttribute(node) || node.name.getText(sourceFile) !== 'style') {
    return issues;
  }

  const initializer = node.initializer;
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) {
    return issues;
  }

  const expr = initializer.expression;
  if (!ts.isObjectLiteralExpression(expr)) { return issues; }

  let hasOutlineNone = false;
  let hasAlternativeFocusStyle = false;

  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop)) { continue; }

    const propName = prop.name.getText(sourceFile).replace(/['"]/g, '');

    if (propName === 'outline') {
      const value = prop.initializer;
      if (ts.isStringLiteral(value)) {
        const v = value.text.trim().toLowerCase();
        if (v === 'none' || v === '0' || v === '0px' || v === 'transparent' || v === 'hidden') {
          hasOutlineNone = true;
        }
      } else if (ts.isNumericLiteral(value) && value.text === '0') {
        hasOutlineNone = true;
      }
    }

    if (propName === 'outlineWidth') {
      const value = prop.initializer;
      if (ts.isStringLiteral(value)) {
        const v = value.text.trim().toLowerCase();
        if (v === '0' || v === '0px') {
          hasOutlineNone = true;
        }
      } else if (ts.isNumericLiteral(value) && value.text === '0') {
        hasOutlineNone = true;
      }
    }

    if (propName === 'outlineStyle') {
      const value = prop.initializer;
      if (ts.isStringLiteral(value) && value.text.trim().toLowerCase() === 'none') {
        hasOutlineNone = true;
      }
    }

    // Check for alternative focus indicators
    if (propName === 'boxShadow' || propName === 'borderColor' || propName === 'border') {
      hasAlternativeFocusStyle = true;
    }
  }

  if (hasOutlineNone && !hasAlternativeFocusStyle) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: 'Removing `outline` without an alternative focus style hides the focus indicator (WCAG 2.4.7). Add `boxShadow` or `border` as a replacement.',
      rule: 'focus-visible',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
  }

  return issues;
}
