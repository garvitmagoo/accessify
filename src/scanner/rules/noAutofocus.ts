import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: no-autofocus
 * WCAG 3.2.1 — The `autoFocus` attribute can disorient screen reader users when focus
 * moves unexpectedly on page load. Avoid it unless there's a clear UX justification
 * (e.g. a search-only page).
 */
export function checkNoAutofocus(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxAttribute(node) || node.name.getText(sourceFile) !== 'autoFocus') {
    return issues;
  }

  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  issues.push({
    message: 'Avoid `autoFocus` — it can disorient screen reader and keyboard users by moving focus unexpectedly (WCAG 3.2.1).',
    rule: 'no-autofocus',
    severity: 'warning',
    line,
    column: character,
    snippet: node.parent.getText(sourceFile),
  });

  return issues;
}
