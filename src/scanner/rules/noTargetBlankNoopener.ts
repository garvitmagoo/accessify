import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { getAttrStringValue, hasSpreadProps } from './jsxHelpers';

/**
 * Rule: no-target-blank-noopener
 * Security / best practice — Links and forms opened with `target="_blank"` give
 * the new page access to `window.opener` unless `rel="noopener"` (or
 * `noreferrer`) is set, enabling reverse-tabnabbing attacks. Modern browsers
 * imply `noopener`, but setting it explicitly is the recommended, portable fix.
 *
 * Spread props: Suppressed — `rel` may be supplied dynamically via `{...props}`.
 */
const TARGETS = new Set(['a', 'area', 'form']);

export function checkNoTargetBlankNoopener(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const tagName = node.tagName.getText(sourceFile).toLowerCase();
  if (!TARGETS.has(tagName)) { return issues; }

  const target = getAttrStringValue(node, 'target', sourceFile);
  if (target !== '_blank') { return issues; }

  if (hasSpreadProps(node)) { return issues; }

  const rel = getAttrStringValue(node, 'rel', sourceFile);
  // `rel` is dynamic (undefined while a `rel` attr is present) → don't guess.
  const hasRelAttr = node.attributes.properties.some(
    p => ts.isJsxAttribute(p) && p.name.getText(sourceFile) === 'rel',
  );
  if (hasRelAttr && rel === undefined) { return issues; }

  const relTokens = (rel ?? '').toLowerCase().split(/\s+/);
  if (relTokens.includes('noopener') || relTokens.includes('noreferrer')) { return issues; }

  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  issues.push({
    message: '`target="_blank"` without `rel="noopener noreferrer"` exposes `window.opener` to the linked page (reverse tabnabbing). Add `rel="noopener noreferrer"`.',
    rule: 'no-target-blank-noopener',
    severity: 'warning',
    line,
    column: character,
    snippet: node.getText(sourceFile),
  });

  return issues;
}
