import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { hasSpreadProps, getAttrStringValue, hasAttr, isAriaHidden } from './jsxHelpers';

/**
 * Rule: button-label
 * Every <button> or <Button> must have accessible text content or an aria-label.
 *
 * Handles:
 *  - Spread props — suppresses when `{...props}` might carry labels.
 *  - sr-only / visually-hidden children — recognised as accessible text.
 *  - aria-hidden elements are skipped.
 *  - Empty `aria-label=""` is flagged explicitly.
 */

function isButtonTag(tagName: string): boolean {
  return tagName.toLowerCase() === 'button' || tagName === 'IconButton';
}

function hasNonEmptyLabelAttr(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): boolean {
  for (const name of ['aria-label', 'aria-labelledby', 'title'] as const) {
    const val = getAttrStringValue(node, name, sf);
    if (val !== undefined && val.trim().length > 0) { return true; }
    if (val === undefined && hasAttr(node, name, sf)) { return true; }
  }
  return false;
}

/** Returns true if any attribute with the given names is present (even empty). */
function hasAnyLabelAttr(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): boolean {
  return ['aria-label', 'aria-labelledby', 'title'].some(name =>
    hasAttr(node, name, sf),
  );
}

/** Check whether a JsxElement has visible or sr-only text children. */
function hasAccessibleChildren(parent: ts.JsxElement, sf: ts.SourceFile): boolean {
  return parent.children.some(child => {
    // Direct text
    if (ts.isJsxText(child) && child.getText(sf).trim().length > 0) { return true; }
    // Child element that might be sr-only text or have text content
    if (ts.isJsxElement(child)) {
      const inner = child.children.some(c =>
        ts.isJsxText(c) && c.getText(sf).trim().length > 0,
      );
      if (inner) { return true; }
    }
    // Self-closing child with aria-label (e.g. <Icon aria-label="..." />)
    if (ts.isJsxSelfClosingElement(child)) {
      if (getAttrStringValue(child, 'aria-label', sf)) { return true; }
    }
    return false;
  });
}

export function checkButtonLabel(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    if (!isButtonTag(tagName)) { return issues; }

    // Skip hidden buttons
    if (isAriaHidden(node, sourceFile)) { return issues; }

    // Spread props may carry labels dynamically
    if (hasSpreadProps(node)) { return issues; }

    // Check for empty label attributes
    if (hasAnyLabelAttr(node, sourceFile) && !hasNonEmptyLabelAttr(node, sourceFile)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      issues.push({
        message: 'Button has an empty `aria-label` or `title`. Provide meaningful text for screen readers.',
        rule: 'button-label',
        severity: 'error',
        line,
        column: character,
        snippet: node.getText(sourceFile),
      });
      return issues;
    }

    if (!hasNonEmptyLabelAttr(node, sourceFile)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      issues.push({
        message: 'Self-closing button/IconButton must have `aria-label`, `aria-labelledby`, or `title` for screen readers.',
        rule: 'button-label',
        severity: 'error',
        line,
        column: character,
        snippet: node.getText(sourceFile),
      });
    }
  }

  if (ts.isJsxOpeningElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    if (!isButtonTag(tagName)) { return issues; }

    // Skip hidden buttons
    if (isAriaHidden(node, sourceFile)) { return issues; }

    // Spread props may carry labels dynamically
    if (hasSpreadProps(node)) { return issues; }

    const hasLabel = hasNonEmptyLabelAttr(node, sourceFile);

    // Check for empty label attributes
    if (hasAnyLabelAttr(node, sourceFile) && !hasLabel) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      issues.push({
        message: 'Button has an empty `aria-label` or `title`. Provide meaningful text for screen readers.',
        rule: 'button-label',
        severity: 'error',
        line,
        column: character,
        snippet: node.getText(sourceFile),
      });
      return issues;
    }

    // Check if the parent JsxElement has children (text content)
    const parent = node.parent;
    let hasTextContent = false;
    if (ts.isJsxElement(parent)) {
      hasTextContent = hasAccessibleChildren(parent, sourceFile);
    }

    if (!hasLabel && !hasTextContent) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      issues.push({
        message: 'Button must have visible text content, `aria-label`, or `aria-labelledby`.',
        rule: 'button-label',
        severity: 'warning',
        line,
        column: character,
        snippet: node.getText(sourceFile),
      });
    }
  }

  return issues;
}
