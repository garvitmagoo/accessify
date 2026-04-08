import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: nextjs-head-lang
 * In Next.js pages using <Html> from next/document, the <Html> element
 * must have a `lang` attribute for screen readers and search engines.
 */
export function checkNextjsHeadLang(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
    const tagName = node.tagName.getText(sourceFile);

    // Match Next.js <Html> component (from next/document) and standard <html>
    if (tagName === 'Html' || tagName === 'html') {
      const hasLang = node.attributes.properties.some(
        attr => ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'lang'
      );

      if (!hasLang) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        issues.push({
          message: `\`<${tagName}>\` element must have a \`lang\` attribute (e.g. lang="en") for accessibility and SEO.`,
          rule: 'nextjs-head-lang',
          severity: 'error',
          line,
          column: character,
          snippet: node.getText(sourceFile),
        });
      }
    }
  }

  return issues;
}
