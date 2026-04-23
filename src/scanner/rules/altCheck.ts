/**
 * Factory for creating alt-attribute checkers.
 * Shared by img-alt and nextjs-image-alt rules to avoid duplication.
 */

import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { hasSpreadProps, isAriaHidden, hasAttr } from './jsxHelpers';

export interface AltCheckConfig {
  tagName: string;
  ruleId: string;
  message: string;
}

/**
 * Creates a rule checker that flags JSX elements missing an `alt` attribute.
 *
 * Handles:
 *  - Spread props (`{...props}`) — suppresses the warning since alt may be
 *    passed dynamically.
 *  - Decorative images — `aria-hidden="true"`, `role="presentation"`, and
 *    `role="none"` exempt the element from needing alt text.
 *  - `alt=""` is considered valid (marks a decorative/redundant image per WCAG).
 */
export function createAltChecker(config: AltCheckConfig) {
  return (node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
      return [];
    }

    const tagName = node.tagName.getText(sourceFile);
    if (tagName !== config.tagName) {
      return [];
    }

    // Decorative / hidden images don't need alt text
    if (isAriaHidden(node, sourceFile)) {
      return [];
    }

    // alt="" is valid for decorative images (WCAG H67)
    const hasAlt = hasAttr(node, 'alt', sourceFile);
    if (hasAlt) {
      return [];
    }

    // Spread props may carry `alt` dynamically — suppress to avoid false positive
    if (hasSpreadProps(node)) {
      return [];
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return [{
      message: config.message,
      rule: config.ruleId,
      severity: 'error',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    }];
  };
}
