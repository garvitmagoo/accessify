import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: no-access-key
 * WCAG 2.1 — The `accessKey` attribute assigns keyboard shortcuts that conflict
 * with assistive technology and browser shortcuts, and are not discoverable by users.
 */
export function checkNoAccessKey(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxAttribute(node) || node.name.getText(sourceFile) !== 'accessKey') {
    return issues;
  }

  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  issues.push({
    message: 'Avoid `accessKey` — keyboard shortcuts conflict with assistive technology and are not discoverable by users.',
    rule: 'no-access-key',
    severity: 'warning',
    line,
    column: character,
    snippet: node.parent.getText(sourceFile),
  });

  return issues;
}
