import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: no-positive-tabindex
 * WCAG 2.4.3 — tabIndex values greater than 0 create unpredictable focus
 * order and should be avoided. Use tabIndex={0} or tabIndex={-1} instead.
 */
export function checkNoPositiveTabindex(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxAttribute(node) || node.name.getText(sourceFile) !== 'tabIndex') {
    return issues;
  }

  const initializer = node.initializer;
  if (!initializer) { return issues; }

  let numericValue: number | undefined;

  // tabIndex={5}
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expr = initializer.expression;
    if (ts.isNumericLiteral(expr)) {
      numericValue = Number(expr.text);
    } else if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expr.operand)) {
      numericValue = -Number(expr.operand.text);
    }
  }

  // tabIndex="5"
  if (ts.isStringLiteral(initializer)) {
    const parsed = parseInt(initializer.text, 10);
    if (!isNaN(parsed)) { numericValue = parsed; }
  }

  if (numericValue !== undefined && numericValue > 0) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: `Avoid tabIndex={${numericValue}}. Positive tabIndex values disrupt natural focus order (WCAG 2.4.3). Use 0 or -1 instead.`,
      rule: 'no-positive-tabindex',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
  }

  return issues;
}
