import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { hasSpreadProps } from './jsxHelpers';

/**
 * Rule: media-has-caption
 * WCAG 1.2.2 / 1.2.3 — `<video>` elements must have captions for deaf/hard-of-hearing users.
 * Checks for `<track kind="captions">` children or muted attribute (muted video doesn't need captions).
 *
 * Spread props: Suppressed — muted / captions config may be provided dynamically.
 */
export function checkMediaHasCaption(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const tagName = node.tagName.getText(sourceFile).toLowerCase();
  if (tagName !== 'video' && tagName !== 'audio') { return issues; }

  // Spread props may carry muted or other config dynamically
  if (hasSpreadProps(node)) { return issues; }

  const attrs = node.attributes.properties;

  // Muted video is exempt (no audio to caption)
  const isMuted = attrs.some(attr =>
    ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'muted',
  );
  if (isMuted) { return issues; }

  // Self-closing <video /> can't have <track> children
  if (ts.isJsxSelfClosingElement(node)) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: `\`<${tagName}>\` must have a \`<track kind="captions">\` child for deaf and hard-of-hearing users (WCAG 1.2.2).`,
      rule: 'media-has-caption',
      severity: 'error',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
    return issues;
  }

  // Opening element — check children for <track kind="captions|subtitles">
  if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
    const hasTrack = node.parent.children.some(child => {
      if (!ts.isJsxSelfClosingElement(child) && !ts.isJsxElement(child)) { return false; }
      const el = ts.isJsxElement(child) ? child.openingElement : child;
      if (el.tagName.getText(sourceFile).toLowerCase() !== 'track') { return false; }

      for (const attr of el.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || attr.name.getText(sourceFile) !== 'kind') { continue; }
        if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
          const kind = attr.initializer.text.toLowerCase();
          return kind === 'captions' || kind === 'subtitles';
        }
      }
      return false;
    });

    if (!hasTrack) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      issues.push({
        message: `\`<${tagName}>\` must have a \`<track kind="captions">\` child for deaf and hard-of-hearing users (WCAG 1.2.2).`,
        rule: 'media-has-caption',
        severity: 'error',
        line,
        column: character,
        snippet: node.getText(sourceFile),
      });
    }
  }

  return issues;
}
