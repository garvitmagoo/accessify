import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: aria-pattern
 * Validates that composite ARIA widget patterns are correctly implemented.
 *
 * Patterns checked:
 *  - tablist must contain tab children
 *  - tab must have aria-controls
 *  - tabpanel must have aria-labelledby
 *  - dialog / alertdialog must have aria-labelledby or aria-label
 *  - menu / menubar must contain menuitem / menuitemradio / menuitemcheckbox
 *  - listbox must contain option children
 *  - tree must contain treeitem children
 *  - radiogroup must contain radio children
 *  - combobox must have aria-expanded
 *  - grid must contain row → gridcell
 */

/** Helpers ----------------------------------------------------------------- */

function getAttr(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  name: string,
  sf: ts.SourceFile,
): string | undefined {
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop) || prop.name.getText(sf) !== name) { continue; }
    if (!prop.initializer) { return ''; }
    if (ts.isStringLiteral(prop.initializer)) { return prop.initializer.text; }
    if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
      if (ts.isStringLiteral(prop.initializer.expression)) { return prop.initializer.expression.text; }
      return prop.initializer.expression.getText(sf);
    }
    return '';
  }
  return undefined;
}

function hasAttr(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  name: string,
  sf: ts.SourceFile,
): boolean {
  return getAttr(node, name, sf) !== undefined;
}

/** Returns true only if attr exists AND has a non-empty value */
function hasNonEmptyAttr(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  name: string,
  sf: ts.SourceFile,
): boolean {
  const val = getAttr(node, name, sf);
  return val !== undefined && val.trim() !== '';
}

function getRole(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): string | undefined {
  return getAttr(node, 'role', sf);
}

function childRoles(parent: ts.JsxElement, sf: ts.SourceFile): string[] {
  const roles: string[] = [];
  for (const child of parent.children) {
    if (ts.isJsxElement(child)) {
      const r = getRole(child.openingElement, sf);
      if (r) { roles.push(r); }
    } else if (ts.isJsxSelfClosingElement(child)) {
      const r = getRole(child, sf);
      if (r) { roles.push(r); }
    }
  }
  return roles;
}

function pos(node: ts.Node, sf: ts.SourceFile): { line: number; character: number } {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf));
}

/** Main rule --------------------------------------------------------------- */

export function checkAriaPattern(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  // We only care about opening elements (which have children) or self-closing
  if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
    return issues;
  }

  const role = getRole(node, sourceFile);
  if (!role) { return issues; }

  const { line, character } = pos(node, sourceFile);
  const snippet = node.getText(sourceFile);

  const parentElement = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)
    ? node.parent
    : undefined;

  switch (role) {
    // ── tablist must contain tab ──
    case 'tablist': {
      if (parentElement) {
        const kids = childRoles(parentElement, sourceFile);
        if (!kids.includes('tab')) {
          issues.push({
            message: '`role="tablist"` must contain children with `role="tab"`.',
            rule: 'aria-pattern',
            severity: 'error',
            line, column: character, snippet,
          });
        }
      }
      break;
    }

    // ── tab must have aria-controls ──
    case 'tab': {
      if (!hasAttr(node, 'aria-controls', sourceFile) && !hasAttr(node, 'aria-selected', sourceFile)) {
        issues.push({
          message: '`role="tab"` should have `aria-controls` pointing to its tabpanel and `aria-selected`.',
          rule: 'aria-pattern',
          severity: 'warning',
          line, column: character, snippet,
        });
      }
      break;
    }

    // ── tabpanel must have aria-labelledby ──
    case 'tabpanel': {
      if (!hasNonEmptyAttr(node, 'aria-labelledby', sourceFile) && !hasNonEmptyAttr(node, 'aria-label', sourceFile)) {
        issues.push({
          message: '`role="tabpanel"` must have `aria-labelledby` or `aria-label`.',
          rule: 'aria-pattern',
          severity: 'warning',
          line, column: character, snippet,
        });
      }
      break;
    }

    // ── dialog / alertdialog must be labelled ──
    case 'dialog':
    case 'alertdialog': {
      const hasLabel = hasNonEmptyAttr(node, 'aria-label', sourceFile);
      const hasLabelledBy = hasNonEmptyAttr(node, 'aria-labelledby', sourceFile);
      if (!hasLabel && !hasLabelledBy) {
        // Check if an empty aria-label/aria-labelledby was provided
        const hasEmptyLabel = hasAttr(node, 'aria-label', sourceFile) && !hasLabel;
        const hasEmptyLabelledBy = hasAttr(node, 'aria-labelledby', sourceFile) && !hasLabelledBy;
        const emptyNote = (hasEmptyLabel || hasEmptyLabelledBy)
          ? ' The current value is empty — provide a descriptive label.'
          : '';
        issues.push({
          message: `\`role="${role}"\` must have \`aria-labelledby\` or \`aria-label\`.${emptyNote}`,
          rule: 'aria-pattern',
          severity: 'error',
          line, column: character, snippet,
        });
      }
      break;
    }

    // ── menu / menubar must contain menuitem ──
    case 'menu':
    case 'menubar': {
      if (parentElement) {
        const kids = childRoles(parentElement, sourceFile);
        const valid = kids.some(r => r === 'menuitem' || r === 'menuitemradio' || r === 'menuitemcheckbox');
        if (!valid) {
          issues.push({
            message: `\`role="${role}"\` must contain children with \`role="menuitem"\`, \`menuitemradio\`, or \`menuitemcheckbox\`.`,
            rule: 'aria-pattern',
            severity: 'error',
            line, column: character, snippet,
          });
        }
      }
      break;
    }

    // ── listbox must contain option ──
    case 'listbox': {
      if (parentElement) {
        const kids = childRoles(parentElement, sourceFile);
        if (!kids.includes('option')) {
          issues.push({
            message: '`role="listbox"` must contain children with `role="option"`.',
            rule: 'aria-pattern',
            severity: 'error',
            line, column: character, snippet,
          });
        }
      }
      break;
    }

    // ── tree must contain treeitem ──
    case 'tree': {
      if (parentElement) {
        const kids = childRoles(parentElement, sourceFile);
        if (!kids.includes('treeitem')) {
          issues.push({
            message: '`role="tree"` must contain children with `role="treeitem"`.',
            rule: 'aria-pattern',
            severity: 'error',
            line, column: character, snippet,
          });
        }
      }
      break;
    }

    // ── radiogroup must contain radio ──
    case 'radiogroup': {
      if (parentElement) {
        const kids = childRoles(parentElement, sourceFile);
        if (!kids.includes('radio')) {
          issues.push({
            message: '`role="radiogroup"` must contain children with `role="radio"`.',
            rule: 'aria-pattern',
            severity: 'error',
            line, column: character, snippet,
          });
        }
      }
      break;
    }

    // ── combobox must have aria-expanded ──
    case 'combobox': {
      if (!hasAttr(node, 'aria-expanded', sourceFile)) {
        issues.push({
          message: '`role="combobox"` must have `aria-expanded` attribute.',
          rule: 'aria-pattern',
          severity: 'warning',
          line, column: character, snippet,
        });
      }
      break;
    }

    // ── grid must contain row ──
    case 'grid': {
      if (parentElement) {
        const kids = childRoles(parentElement, sourceFile);
        if (!kids.includes('row')) {
          issues.push({
            message: '`role="grid"` must contain children with `role="row"`.',
            rule: 'aria-pattern',
            severity: 'error',
            line, column: character, snippet,
          });
        }
      }
      break;
    }
  }

  return issues;
}
