import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: nextjs-link-text
 * Next.js <Link> component must have discernible text content for screen readers.
 * The link should have child text, aria-label, or aria-labelledby.
 *
 * Catches:
 *  - Self-closing <Link /> with no aria-label
 *  - <Link> wrapping only an icon/image without aria-label
 */
export function checkNextjsLink(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    if (tagName === 'Link') {
      const hasAccessibleName = node.attributes.properties.some(
        attr => ts.isJsxAttribute(attr) && (
          attr.name.getText(sourceFile) === 'aria-label' ||
          attr.name.getText(sourceFile) === 'aria-labelledby' ||
          attr.name.getText(sourceFile) === 'title'
        )
      );

      if (!hasAccessibleName) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        issues.push({
          message: 'Next.js `<Link>` must have discernible text. Add child text, `aria-label`, or `aria-labelledby`.',
          rule: 'nextjs-link-text',
          severity: 'warning',
          line,
          column: character,
          snippet: node.getText(sourceFile),
        });
      }
    }
  }

  if (ts.isJsxOpeningElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    if (tagName === 'Link') {
      const hasAccessibleName = node.attributes.properties.some(
        attr => ts.isJsxAttribute(attr) && (
          attr.name.getText(sourceFile) === 'aria-label' ||
          attr.name.getText(sourceFile) === 'aria-labelledby' ||
          attr.name.getText(sourceFile) === 'title'
        )
      );

      // Check if parent JsxElement has text content (not just other elements)
      const parent = node.parent;
      let hasTextContent = false;
      if (ts.isJsxElement(parent)) {
        hasTextContent = parent.children.some(child => {
          // Direct text content
          if (ts.isJsxText(child) && child.getText(sourceFile).trim().length > 0) {
            return true;
          }
          // Text expression like {'Home'}
          if (ts.isJsxExpression(child) && child.expression &&
              ts.isStringLiteral(child.expression)) {
            return true;
          }
          return false;
        });
      }

      if (!hasAccessibleName && !hasTextContent) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        issues.push({
          message: 'Next.js `<Link>` must have discernible text. Add child text, `aria-label`, or `aria-labelledby`.',
          rule: 'nextjs-link-text',
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
