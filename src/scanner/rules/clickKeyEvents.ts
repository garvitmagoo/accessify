import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: click-events-have-key-events
 * Elements with onClick must also have onKeyDown/onKeyUp/onKeyPress for keyboard accessibility.
 * Only applies to non-interactive HTML elements (div, span, etc.).
 */
const INTERACTIVE_ELEMENTS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
]);

export function checkClickKeyEvents(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
    const tagName = node.tagName.getText(sourceFile).toLowerCase();

    // Skip natively interactive elements and React components (PascalCase)
    if (INTERACTIVE_ELEMENTS.has(tagName) || /^[A-Z]/.test(node.tagName.getText(sourceFile))) {
      return issues;
    }

    const attrs = node.attributes.properties;
    const hasOnClick = attrs.some(attr =>
      ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'onClick'
    );

    if (hasOnClick) {
      const hasKeyEvent = attrs.some(attr =>
        ts.isJsxAttribute(attr) && (
          attr.name.getText(sourceFile) === 'onKeyDown' ||
          attr.name.getText(sourceFile) === 'onKeyUp' ||
          attr.name.getText(sourceFile) === 'onKeyPress'
        )
      );

      const hasRole = attrs.some(attr =>
        ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'role'
      );

      const hasTabIndex = attrs.some(attr =>
        ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'tabIndex'
      );

      if (!hasKeyEvent) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const suggestions: string[] = [];
        if (!hasRole) suggestions.push('`role`');
        if (!hasTabIndex) suggestions.push('`tabIndex={0}`');
        suggestions.push('`onKeyDown`');

        issues.push({
          message: `Non-interactive element <${tagName}> with \`onClick\` must have keyboard support. Add ${suggestions.join(', ')}.`,
          rule: 'click-events-have-key-events',
          severity: 'warning',
          line,
          column: character,
          snippet: node.getText(sourceFile),
        });
      }
    }
  }

  return issues;
}
