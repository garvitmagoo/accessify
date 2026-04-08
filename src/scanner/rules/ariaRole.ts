import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: aria-role
 * ARIA role attributes must use valid WCAG-defined role values.
 */
export const VALID_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'button',
  'cell', 'checkbox', 'columnheader', 'combobox', 'complementary',
  'contentinfo', 'definition', 'dialog', 'directory', 'document',
  'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading',
  'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main',
  'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'navigation', 'none', 'note', 'option', 'presentation',
  'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
  'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider',
  'spinbutton', 'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel',
  'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid',
  'treeitem',
]);

export function checkAriaRole(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'role') {
    const initializer = node.initializer;
    if (initializer && ts.isStringLiteral(initializer)) {
      const roleValue = initializer.text.trim().toLowerCase();
      if (roleValue && !VALID_ROLES.has(roleValue)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        issues.push({
          message: `Invalid ARIA role "${roleValue}". Must be a valid WAI-ARIA role.`,
          rule: 'aria-role',
          severity: 'error',
          line,
          column: character,
          snippet: node.getText(sourceFile),
          data: { invalidRole: roleValue },
        });
      }
    }
  }

  return issues;
}
