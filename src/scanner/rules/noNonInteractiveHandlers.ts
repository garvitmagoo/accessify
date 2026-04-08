import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

const INTERACTIVE_ELEMENTS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
]);

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'radio', 'switch', 'tab', 'checkbox', 'slider',
  'spinbutton', 'textbox', 'combobox', 'searchbox', 'gridcell',
]);

const HANDLER_PROPS = new Set([
  'onClick', 'onMouseDown', 'onMouseUp', 'onDoubleClick',
  'onKeyDown', 'onKeyUp', 'onKeyPress',
]);

export function checkNoNonInteractiveHandlers(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const rawTag = node.tagName.getText(sourceFile);
  if (INTERACTIVE_ELEMENTS.has(rawTag.toLowerCase()) || /^[A-Z]/.test(rawTag)) {
    return issues;
  }

  const attrs = node.attributes.properties;
  let hasHandler = false;
  let roleValue: string | undefined;

  for (const attr of attrs) {
    if (!ts.isJsxAttribute(attr)) { continue; }
    const name = attr.name.getText(sourceFile);
    if (HANDLER_PROPS.has(name)) { hasHandler = true; }
    if (name === 'role') {
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
        roleValue = attr.initializer.text;
      } else if (
        attr.initializer &&
        ts.isJsxExpression(attr.initializer) &&
        attr.initializer.expression &&
        ts.isStringLiteral(attr.initializer.expression)
      ) {
        roleValue = attr.initializer.expression.text;
      }
    }
  }

  if (!hasHandler) { return issues; }

  if (roleValue && INTERACTIVE_ROLES.has(roleValue)) {
    return issues;
  }

  const suggested = rawTag.toLowerCase() === 'span' ? '<button>' : '<button> or an interactive element';
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  issues.push({
    message: `\`<${rawTag}>\` has event handlers but is not an interactive element. Use ${suggested} for proper semantics and built-in keyboard support (WCAG 4.1.2).`,
    rule: 'no-noninteractive-element-interactions',
    severity: 'warning',
    line,
    column: character,
    snippet: node.getText(sourceFile),
  });

  return issues;
}
