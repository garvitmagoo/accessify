import * as ts from 'typescript';
import type { A11yIssue } from '../types';
import { checkImgAlt } from './rules/imgAlt';
import { checkButtonLabel } from './rules/buttonLabel';
import { checkAriaRole } from './rules/ariaRole';
import { checkFormLabel } from './rules/formLabel';
import { checkClickKeyEvents } from './rules/clickKeyEvents';
import { checkAriaPattern } from './rules/ariaPattern';
import { checkColorContrast } from './rules/colorContrast';
import { createHeadingOrderChecker } from './rules/headingOrder';
import { checkNextjsImageAlt } from './rules/nextjsImage';
import { checkNextjsHeadLang } from './rules/nextjsHeadLang';
import { checkNextjsLink } from './rules/nextjsLink';
import { checkAutocompleteValid } from './rules/autocompleteValid';
import { checkNoMouseOnlyHover } from './rules/noMouseOnlyHover';
import { checkNoAutofocus } from './rules/noAutofocus';
import { checkInteractiveSupportsFocus } from './rules/interactiveSupportsFocus';
import { checkNoNonInteractiveHandlers } from './rules/noNonInteractiveHandlers';
import { checkSvgAccessibleName } from './rules/svgAccessibleName';
import { checkAnchorIsValid } from './rules/anchorIsValid';
import { checkFocusVisible } from './rules/focusVisible';
import { checkLabelHasAssociatedControl } from './rules/labelHasAssociatedControl';
import { checkMediaHasCaption } from './rules/mediaHasCaption';
import { checkPageTitle } from './rules/pageTitle';
import { checkPreferSemanticElements } from './rules/preferSemanticElements';
import { checkSkipLink } from './rules/skipLink';

type RuleChecker = (node: ts.Node, sourceFile: ts.SourceFile) => A11yIssue[];

const PER_NODE_RULES: RuleChecker[] = [
  checkImgAlt,
  checkButtonLabel,
  checkAriaRole,
  checkFormLabel,
  checkClickKeyEvents,
  checkAriaPattern,
  checkColorContrast,
  checkNextjsImageAlt,
  checkNextjsHeadLang,
  checkNextjsLink,
  checkAutocompleteValid,
  checkNoMouseOnlyHover,
  checkNoAutofocus,
  checkInteractiveSupportsFocus,
  checkNoNonInteractiveHandlers,
  checkSvgAccessibleName,
  checkAnchorIsValid,
  checkFocusVisible,
  checkLabelHasAssociatedControl,
  checkMediaHasCaption,
  checkPageTitle,
  checkPreferSemanticElements,
  checkSkipLink,
];

/**
 * Scan a source file's text for accessibility issues using the TypeScript AST.
 */
export function scanForA11yIssues(sourceCode: string, fileName: string): A11yIssue[] {
  try {
    return scanForA11yIssuesUnsafe(sourceCode, fileName);
  } catch (e) {
    console.error(`[Accessify] Error scanning ${fileName}:`, e);
    return [];
  }
}

function scanForA11yIssuesUnsafe(sourceCode: string, fileName: string): A11yIssue[] {
  const isTsx = fileName.endsWith('.tsx') || fileName.endsWith('.jsx') || fileName.endsWith('.html');
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const issues: A11yIssue[] = [];

  // File-level rules that need state across nodes
  const checkHeadingOrder = createHeadingOrderChecker();

  function visit(node: ts.Node) {
    for (const rule of PER_NODE_RULES) {
      const ruleIssues = rule(node, sourceFile);
      issues.push(...ruleIssues);
    }
    // Heading order collects headings per-node (no-op for non-heading nodes)
    checkHeadingOrder(node, sourceFile);

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  // Run heading checker on the SourceFile node to emit collected results
  const finalHeadingIssues = checkHeadingOrder(sourceFile, sourceFile);
  issues.push(...finalHeadingIssues);

  return issues;
}
