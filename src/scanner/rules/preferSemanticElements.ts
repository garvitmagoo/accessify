import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

const ROLE_TO_ELEMENT: Record<string, string> = {
  banner: '<header>',
  complementary: '<aside>',
  contentinfo: '<footer>',
  form: '<form>',
  main: '<main>',
  navigation: '<nav>',
  region: '<section>',
  button: '<button>',
  link: '<a>',
  img: '<img>',
  list: '<ul> or <ol>',
  listitem: '<li>',
  table: '<table>',
  row: '<tr>',
  cell: '<td>',
  heading: '<h1>–<h6>',
  article: '<article>',
  dialog: '<dialog>',
  separator: '<hr>',
  figure: '<figure>',
  term: '<dfn>',
  definition: '<dd>',
  search: '<search> or <form>',
};

const NON_SEMANTIC_ELEMENTS = new Set(['div', 'span']);

export function checkPreferSemanticElements(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const rawTag = node.tagName.getText(sourceFile);
  if (!NON_SEMANTIC_ELEMENTS.has(rawTag.toLowerCase())) {
    return issues;
  }

  const attrs = node.attributes.properties;
  let roleValue: string | undefined;

  for (const attr of attrs) {
    if (!ts.isJsxAttribute(attr)) { continue; }
    if (attr.name.getText(sourceFile) !== 'role') { continue; }

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
    break;
  }

  if (!roleValue) { return issues; }

  const suggestion = ROLE_TO_ELEMENT[roleValue];
  if (!suggestion) { return issues; }

  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  issues.push({
    message: `Prefer native ${suggestion} instead of \`<${rawTag} role="${roleValue}">\`. Native semantic elements provide built-in accessibility without ARIA (WCAG 1.3.1).`,
    rule: 'prefer-semantic-elements',
    severity: 'warning',
    line,
    column: character,
    snippet: node.getText(sourceFile),
  });

  return issues;
}
