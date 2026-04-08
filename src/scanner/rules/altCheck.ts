/**
 * Factory for creating alt-attribute checkers.
 * Shared by img-alt and nextjs-image-alt rules to avoid duplication.
 */

import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

export interface AltCheckConfig {
  /** Tag name to match (e.g. 'img', 'Image') */
  tagName: string;
  /** Rule ID (e.g. 'img-alt', 'nextjs-image-alt') */
  ruleId: string;
  /** Error message when alt is missing */
  message: string;
}

/**
 * Creates a rule checker that flags JSX elements missing an `alt` attribute.
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

    const hasAlt = node.attributes.properties.some(
      attr => ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'alt'
    );

    if (hasAlt) {
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
