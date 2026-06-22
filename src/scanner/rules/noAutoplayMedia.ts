import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { hasSpreadProps, hasAttr } from './jsxHelpers';

/**
 * Rule: no-autoplay-media
 * WCAG 1.4.2 (Audio Control) — Media that plays automatically for more than a
 * few seconds must let users pause, stop, or mute it. An `autoPlay` `<video>` /
 * `<audio>` with no `controls` and no `muted` attribute gives users no way to
 * stop sound that may interfere with screen readers.
 *
 * Spread props suppress the check since `muted` / `controls` may be dynamic.
 */
export function checkNoAutoplayMedia(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const tagName = node.tagName.getText(sourceFile).toLowerCase();
  if (tagName !== 'video' && tagName !== 'audio') { return issues; }
  if (hasSpreadProps(node)) { return issues; }

  // React uses `autoPlay`; allow the HTML lowercase form too.
  const autoPlay = hasAttr(node, 'autoPlay', sourceFile) || hasAttr(node, 'autoplay', sourceFile);
  if (!autoPlay) { return issues; }

  // A muted video, or media with visible controls, satisfies WCAG 1.4.2.
  if (hasAttr(node, 'muted', sourceFile) || hasAttr(node, 'controls', sourceFile)) {
    return issues;
  }

  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  issues.push({
    message: `Autoplaying \`<${tagName}>\` has no \`controls\` or \`muted\` attribute — users can't stop the audio. Add \`muted\` or \`controls\` (WCAG 1.4.2).`,
    rule: 'no-autoplay-media',
    severity: 'warning',
    line,
    column: character,
    snippet: node.getText(sourceFile),
  });

  return issues;
}
