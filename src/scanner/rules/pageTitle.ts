import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: page-title
 * WCAG 2.4.2 — Next.js pages using `<Head>` must include a `<title>` child.
 * Flags `<Head>` components that have no `<title>` element inside.
 */
export function checkPageTitle(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxElement(node)) { return issues; }

  const openingTag = node.openingElement;
  const tagName = openingTag.tagName.getText(sourceFile);

  if (tagName !== 'Head' && tagName !== 'head') { return issues; }

  // Check if any child is a <title> element
  const hasTitle = node.children.some(child => {
    if (ts.isJsxElement(child)) {
      return child.openingElement.tagName.getText(sourceFile) === 'title';
    }
    if (ts.isJsxSelfClosingElement(child)) {
      return child.tagName.getText(sourceFile) === 'title';
    }
    return false;
  });

  if (!hasTitle) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(openingTag.getStart(sourceFile));
    issues.push({
      message: '`<Head>` is missing a `<title>` element. Pages must have descriptive titles (WCAG 2.4.2).',
      rule: 'page-title',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile).slice(0, 120),
    });
  }

  return issues;
}
