import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { hasSpreadProps, getAttrStringValue, hasAttr } from './jsxHelpers';

/**
 * Rule: label-has-associated-control
 * WCAG 1.3.1 / 4.1.2 — A `<label>` element must be associated with a form
 * control, either via the `htmlFor` attribute pointing to an input's `id`,
 * or by wrapping the control as a child.
 *
 * Catches orphan `<label>` elements that aren't linked to any input.
 */

const FORM_CONTROLS = new Set([
  'input', 'select', 'textarea',
]);

export function checkLabelHasAssociatedControl(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const tagName = node.tagName.getText(sourceFile).toLowerCase();
  if (tagName !== 'label') { return issues; }

  if (hasSpreadProps(node)) { return issues; }

  // Check for htmlFor attribute
  const htmlFor = getAttrStringValue(node, 'htmlFor', sourceFile);
  if (htmlFor !== undefined && htmlFor.trim().length > 0) { return issues; }

  // Also check `for` (HTML attribute, sometimes used)
  const forAttr = getAttrStringValue(node, 'for', sourceFile);
  if (forAttr !== undefined && forAttr.trim().length > 0) { return issues; }

  // Dynamic htmlFor (expression)
  if (hasAttr(node, 'htmlFor', sourceFile) || hasAttr(node, 'for', sourceFile)) {
    return issues; // dynamic — can't validate
  }

  // Self-closing <label /> — can't wrap a control
  if (ts.isJsxSelfClosingElement(node)) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: '`<label>` must be associated with a form control. Add `htmlFor="inputId"` or wrap the input inside the label (WCAG 1.3.1).',
      rule: 'label-has-associated-control',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
    return issues;
  }

  // Opening element — check for form control children
  if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
    if (hasFormControlDescendant(node.parent, sourceFile)) {
      return issues; // label wraps a control — valid
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: '`<label>` must be associated with a form control. Add `htmlFor="inputId"` or wrap the input inside the label (WCAG 1.3.1).',
      rule: 'label-has-associated-control',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
  }

  return issues;
}

/** Recursively check for form control descendants within a label. */
function hasFormControlDescendant(element: ts.JsxElement, sf: ts.SourceFile): boolean {
  for (const child of element.children) {
    if (ts.isJsxSelfClosingElement(child)) {
      const tag = child.tagName.getText(sf).toLowerCase();
      if (FORM_CONTROLS.has(tag)) { return true; }
      // PascalCase components may be form controls — give benefit of doubt
      if (/^[A-Z]/.test(child.tagName.getText(sf))) { return true; }
    }
    if (ts.isJsxElement(child)) {
      const tag = child.openingElement.tagName.getText(sf).toLowerCase();
      if (FORM_CONTROLS.has(tag)) { return true; }
      if (/^[A-Z]/.test(child.openingElement.tagName.getText(sf))) { return true; }
      if (hasFormControlDescendant(child, sf)) { return true; }
    }
  }
  return false;
}
