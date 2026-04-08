import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: interactive-supports-focus
 * WCAG 2.1.1 — Non-interactive elements with event handlers (onClick, onMouseDown, onMouseUp)
 * should be focusable (have tabIndex) so keyboard-only users can reach them.
 * Complements click-events-have-key-events — that rule checks for keyboard handlers,
 * this one checks for focusability.
 */
const INTERACTIVE_ELEMENTS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
]);

const HANDLER_PROPS = new Set(['onClick', 'onMouseDown', 'onMouseUp', 'onDoubleClick']);

export function checkInteractiveSupportsFocus(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const rawTag = node.tagName.getText(sourceFile);
  // Skip natively interactive elements and React components (PascalCase)
  if (INTERACTIVE_ELEMENTS.has(rawTag.toLowerCase()) || /^[A-Z]/.test(rawTag)) {
    return issues;
  }

  const attrs = node.attributes.properties;
  const hasHandler = attrs.some(attr =>
    ts.isJsxAttribute(attr) && HANDLER_PROPS.has(attr.name.getText(sourceFile)),
  );

  if (!hasHandler) { return issues; }

  const hasTabIndex = attrs.some(attr =>
    ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'tabIndex',
  );
  const hasRole = attrs.some(attr =>
    ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'role',
  );

  if (!hasTabIndex) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: `\`<${rawTag}>\` has an event handler but is not focusable. Add \`tabIndex={0}\`${!hasRole ? ' and an appropriate `role`' : ''} for keyboard accessibility (WCAG 2.1.1).`,
      rule: 'interactive-supports-focus',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
  }

  return issues;
}
