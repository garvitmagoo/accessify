import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: button-label
 * Every <button> or <Button> must have accessible text content or an aria-label.
 */
export function checkButtonLabel(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    if (tagName.toLowerCase() === 'button' || tagName === 'IconButton') {
      const hasAriaLabel = node.attributes.properties.some(
        attr => ts.isJsxAttribute(attr) && (
          attr.name.getText(sourceFile) === 'aria-label' ||
          attr.name.getText(sourceFile) === 'aria-labelledby' ||
          attr.name.getText(sourceFile) === 'title'
        )
      );
      if (!hasAriaLabel) {
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
  }

  if (ts.isJsxOpeningElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    if (tagName.toLowerCase() === 'button' || tagName === 'IconButton') {
      const hasAriaLabel = node.attributes.properties.some(
        attr => ts.isJsxAttribute(attr) && (
          attr.name.getText(sourceFile) === 'aria-label' ||
          attr.name.getText(sourceFile) === 'aria-labelledby' ||
          attr.name.getText(sourceFile) === 'title'
        )
      );

      // Check if the parent JsxElement has children (text content)
      const parent = node.parent;
      let hasTextContent = false;
      if (ts.isJsxElement(parent)) {
        hasTextContent = parent.children.some(child =>
          ts.isJsxText(child) && child.getText(sourceFile).trim().length > 0
        );
      }

      if (!hasAriaLabel && !hasTextContent) {
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
  }

  return issues;
}
