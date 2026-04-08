import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: heading-order
 *
 * Validates that heading levels (h1–h6) follow a logical descending order
 * within a single file. Flags:
 *  - Skipped levels (e.g. h1 → h3, missing h2)
 *  - Multiple h1 elements (a page should have one primary heading)
 *  - Heading level increases by more than 1
 *
 * This is a file-level rule — it collects all headings first, then validates
 * sequence. Unlike per-node rules it returns issues from a post-order pass.
 */

const HEADING_RE = /^h([1-6])$/;

interface HeadingInfo {
  level: number;
  tagName: string;
  line: number;
  column: number;
  snippet: string;
}

/**
 * Collect every heading in the file, then validate ordering.
 * Called per-node like other rules, but only produces results at headings.
 * A wrapper function manages state across calls within a single file scan.
 */
export function createHeadingOrderChecker(): (node: ts.Node, sourceFile: ts.SourceFile) => A11yIssue[] {
  let lastFile: string | undefined;
  let headings: HeadingInfo[] = [];

  return function checkHeadingOrder(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
    // Reset when scanning a new file
    const fileName = sourceFile.fileName;
    if (fileName !== lastFile) {
      lastFile = fileName;
      headings = [];
    }

    // Collect headings
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(sourceFile).toLowerCase();
      const match = tag.match(HEADING_RE);
      if (match) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        headings.push({
          level: parseInt(match[1], 10),
          tagName: node.tagName.getText(sourceFile),
          line,
          column: character,
          snippet: node.getText(sourceFile),
        });
      }
    }

    // Validate when explicitly called with the SourceFile node (final pass)
    if (node.kind !== ts.SyntaxKind.SourceFile || headings.length === 0) {
      return [];
    }

    const result = validateHeadings(headings);
    headings = []; // Reset so repeated calls don't duplicate
    return result;
  };
}

function validateHeadings(headings: HeadingInfo[]): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (headings.length === 0) {
    return issues;
  }

  // Check for multiple h1
  const h1s = headings.filter(h => h.level === 1);
  if (h1s.length > 1) {
    for (let i = 1; i < h1s.length; i++) {
      issues.push({
        message: `Multiple \`<h1>\` elements found. A page should generally have a single \`<h1>\` as the primary heading. Consider using \`<h2>\` or lower.`,
        rule: 'heading-order',
        severity: 'warning',
        line: h1s[i].line,
        column: h1s[i].column,
        snippet: h1s[i].snippet,
        data: { type: 'multiple-h1', currentTag: 'h1' },
      });
    }
  }

  // Check for skipped levels
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1].level;
    const curr = headings[i].level;

    // Going deeper: should only increase by 1
    if (curr > prev && curr - prev > 1) {
      const skipped: string[] = [];
      for (let s = prev + 1; s < curr; s++) {
        skipped.push(`h${s}`);
      }
      issues.push({
        message: `Heading level skipped: \`<${headings[i].tagName}>\` follows \`<h${prev}>\`. Missing ${skipped.map(s => `\`<${s}>\``).join(', ')}. Heading levels should increase by one.`,
        rule: 'heading-order',
        severity: 'warning',
        line: headings[i].line,
        column: headings[i].column,
        snippet: headings[i].snippet,
        data: { type: 'skipped', currentTag: headings[i].tagName, previousLevel: String(prev) },
      });
    }
  }

  // Check that first heading is h1 or h2 (common best practice)
  if (headings[0].level > 2) {
    issues.push({
      message: `First heading in the file is \`<${headings[0].tagName}>\`. Consider starting with \`<h1>\` or \`<h2>\` for proper document structure.`,
      rule: 'heading-order',
      severity: 'info',
      line: headings[0].line,
      column: headings[0].column,
      snippet: headings[0].snippet,
      data: { type: 'first-heading', currentTag: headings[0].tagName },
    });
  }

  return issues;
}
