import * as ts from 'typescript';
import type { A11yIssue } from '../types';

/**
 * Parse a TSX string into a TypeScript AST SourceFile.
 */
export function parseJsx(code: string, fileName = 'test.tsx'): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/**
 * Walk every node in a source file and collect issues from a per-node rule.
 */
export function collectIssues(
  code: string,
  rule: (node: ts.Node, sf: ts.SourceFile) => A11yIssue[],
): A11yIssue[] {
  const sf = parseJsx(code);
  const issues: A11yIssue[] = [];
  function visit(node: ts.Node) {
    issues.push(...rule(node, sf));
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return issues;
}
