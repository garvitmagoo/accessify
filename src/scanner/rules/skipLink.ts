import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: skip-link
 * WCAG 2.4.1 — Pages with repeated navigation blocks must provide a mechanism
 * to bypass them (typically a "Skip to content" link).
 *
 * Checks for a skip link (`<a href="#...">`) as one of the first children
 * inside common layout/page wrapper patterns:
 *  - `<body>`, `<main>`, or components named *Layout*, *Page*, *App*
 *
 * A skip link is an `<a>` element whose `href` starts with `#` and whose
 * text content includes "skip" (case-insensitive).
 */

const LAYOUT_PATTERNS = /^(body|app|layout|page|root)$/i;

function isLayoutComponent(tagName: string): boolean {
  if (tagName === 'body') { return true; }
  return LAYOUT_PATTERNS.test(tagName) || tagName.endsWith('Layout') || tagName.endsWith('Page');
}

function hasSkipLink(children: ts.NodeArray<ts.JsxChild>, sf: ts.SourceFile): boolean {
  // Only check the first 5 children (skip links should be early in the DOM)
  const candidates = children.slice(0, 5);
  for (const child of candidates) {
    if (ts.isJsxElement(child)) {
      const tag = child.openingElement.tagName.getText(sf).toLowerCase();
      if (tag === 'a') {
        if (isSkipAnchor(child.openingElement, child, sf)) { return true; }
      }
      // Check one level deep (skip link may be wrapped in a div/container)
      for (const grandchild of child.children) {
        if (ts.isJsxElement(grandchild)) {
          const innerTag = grandchild.openingElement.tagName.getText(sf).toLowerCase();
          if (innerTag === 'a' && isSkipAnchor(grandchild.openingElement, grandchild, sf)) {
            return true;
          }
        }
      }
    }
    // Self-closing anchor component (e.g. <SkipLink />)
    if (ts.isJsxSelfClosingElement(child)) {
      const tag = child.tagName.getText(sf);
      if (/skip/i.test(tag)) { return true; }
    }
  }
  return false;
}

function isSkipAnchor(
  opening: ts.JsxOpeningElement,
  element: ts.JsxElement,
  sf: ts.SourceFile,
): boolean {
  // Check href starts with #
  for (const prop of opening.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) { continue; }
    if (prop.name.getText(sf) !== 'href') { continue; }
    if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
      if (prop.initializer.text.startsWith('#')) {
        // Verify text content mentions "skip"
        const text = element.children
          .filter(ts.isJsxText)
          .map(c => c.getText(sf))
          .join('');
        if (/skip/i.test(text)) { return true; }
      }
    }
  }
  return false;
}

export function checkSkipLink(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxElement(node)) { return issues; }

  const tagName = node.openingElement.tagName.getText(sourceFile);
  if (!isLayoutComponent(tagName)) { return issues; }

  if (!hasSkipLink(node.children, sourceFile)) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.openingElement.getStart(sourceFile),
    );
    issues.push({
      message: `Layout component \`<${tagName}>\` should include a skip navigation link as one of its first children (e.g. \`<a href="#main-content">Skip to content</a>\`) for keyboard users (WCAG 2.4.1).`,
      rule: 'skip-link',
      severity: 'hint',
      line,
      column: character,
      snippet: node.getText(sourceFile).slice(0, 120),
    });
  }

  return issues;
}
