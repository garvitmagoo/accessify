import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: no-redundant-roles
 * WCAG — Elements should not have ARIA roles that duplicate their implicit semantics.
 * E.g. `<button role="button">` is redundant; the browser already exposes it as a button.
 */
const IMPLICIT_ROLES: Record<string, string> = {
  a: 'link',
  article: 'article',
  aside: 'complementary',
  button: 'button',
  datalist: 'listbox',
  details: 'group',
  dialog: 'dialog',
  fieldset: 'group',
  figure: 'figure',
  footer: 'contentinfo',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'banner',
  hr: 'separator',
  img: 'img',
  input: 'textbox',
  li: 'listitem',
  main: 'main',
  menu: 'list',
  meter: 'meter',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  output: 'status',
  progress: 'progressbar',
  section: 'region',
  select: 'combobox',
  summary: 'button',
  table: 'table',
  tbody: 'rowgroup',
  td: 'cell',
  textarea: 'textbox',
  tfoot: 'rowgroup',
  th: 'columnheader',
  thead: 'rowgroup',
  tr: 'row',
  ul: 'list',
};

export function checkNoRedundantRoles(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const rawTag = node.tagName.getText(sourceFile);
  // Only applies to native HTML elements (lowercase)
  if (/^[A-Z]/.test(rawTag)) { return issues; }

  const tagName = rawTag.toLowerCase();
  const implicitRole = IMPLICIT_ROLES[tagName];
  if (!implicitRole) { return issues; }

  for (const attr of node.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText(sourceFile) !== 'role') { continue; }

    let roleValue: string | undefined;
    if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
      roleValue = attr.initializer.text;
    } else if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression && ts.isStringLiteral(attr.initializer.expression)) {
      roleValue = attr.initializer.expression.text;
    }

    if (roleValue && roleValue.toLowerCase() === implicitRole) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      issues.push({
        message: `\`<${tagName}>\` has implicit role "${implicitRole}". Setting \`role="${roleValue}"\` is redundant.`,
        rule: 'no-redundant-roles',
        severity: 'hint',
        line,
        column: character,
        snippet: node.getText(sourceFile),
        fix: node.getText(sourceFile).replace(/\s+role\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\})/, ''),
      });
    }
    break;
  }

  return issues;
}
