import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { hasSpreadProps, getAttrStringValue, hasAttr } from './jsxHelpers';

/**
 * Rule: form-label
 * Form inputs (<input>, <select>, <textarea>, <TextField>) should have associated labels.
 * Checks for: aria-label, aria-labelledby, id with matching htmlFor, label prop,
 * placeholder (as a fallback indicator), MUI-specific props (InputLabelProps, inputProps,
 * slotProps, slots, componentsProps — all MUI v4/v5/v6 labeling patterns),
 * and wrapping FormControl parent (standard MUI label context pattern).
 *
 * Also handles:
 *  - Spread props — suppresses when `{...props}` may carry labels.
 *  - Empty `aria-label=""` — flagged explicitly as an error.
 */
export function checkFormLabel(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const inputTags = new Set(['input', 'select', 'textarea']);
  const muiInputTags = new Set(['TextField', 'Select', 'Autocomplete', 'NativeSelect', 'FilledInput', 'OutlinedInput', 'Input']);

  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const isHtmlInput = inputTags.has(tagName.toLowerCase());
    const isMuiInput = muiInputTags.has(tagName);

    if (isHtmlInput || isMuiInput) {
      // MUI pattern: <FormControl> wraps inputs and provides label context via <InputLabel>/<FormLabel>
      const isInsideFormControl = isMuiInput && hasFormControlAncestor(node);
      if (isInsideFormControl) return issues;

      // Spread props may carry label dynamically
      if (hasSpreadProps(node)) return issues;

      const attrs = node.attributes.properties;

      // Check for non-empty direct label attributes
      const labelNames = ['aria-label', 'aria-labelledby', 'label'] as const;
      let hasDirectLabel = false;
      let hasEmptyLabel = false;
      for (const name of labelNames) {
        // Check if the attribute exists at all (covers dynamic values like label={var})
        if (hasAttr(node, name, sourceFile)) {
          const val = getAttrStringValue(node, name, sourceFile);
          if (val === undefined) {
            // Dynamic value — can't validate, assume it's fine
            hasDirectLabel = true;
            break;
          }
          if (val.trim().length > 0) {
            hasDirectLabel = true;
            break;
          }
          // val is empty string
          hasEmptyLabel = true;
        }
      }

      // Flag empty label attributes
      if (hasEmptyLabel && !hasDirectLabel) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        issues.push({
          message: `Form control <${tagName}> has an empty \`aria-label\` or \`label\`. Provide meaningful label text.`,
          rule: 'form-label',
          severity: 'error',
          line,
          column: character,
          snippet: node.getText(sourceFile),
        });
        return issues;
      }

      const hasPlaceholder = hasAttr(node, 'placeholder', sourceFile);

      const muiLabelPropNames = new Set([
        'InputLabelProps', 'inputProps', 'InputProps',
        'slotProps', 'slots', 'componentsProps',
        'renderInput',
      ]);
      const hasMuiLabelProps = isMuiInput && attrs.some(attr => {
        if (!ts.isJsxAttribute(attr)) return false;
        return muiLabelPropNames.has(attr.name.getText(sourceFile));
      });

      const hasIdOnly = !hasDirectLabel && !hasPlaceholder && !hasMuiLabelProps && hasAttr(node, 'id', sourceFile);

      // For hidden inputs, skip the check.
      // Dynamic type={…} returns undefined — intentionally treated as NOT hidden
      // so the label check still fires (safer to require a label than to skip).
      const typeVal = getAttrStringValue(node, 'type', sourceFile);
      const isHidden = typeVal === 'hidden';

      if (!hasDirectLabel && !hasPlaceholder && !hasMuiLabelProps && !hasIdOnly && !isHidden) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        issues.push({
          message: `Form control <${tagName}> should have a label. Add \`aria-label\`, \`aria-labelledby\`, or a \`label\` prop.`,
          rule: 'form-label',
          severity: 'warning',
          line,
          column: character,
          snippet: node.getText(sourceFile),
        });
      } else if (hasPlaceholder && !hasDirectLabel && !hasMuiLabelProps && !isHidden) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        issues.push({
          message: `Form control <${tagName}> uses \`placeholder\` as its only label. Placeholders disappear on input — add a persistent \`label\` prop or \`aria-label\`.`,
          rule: 'form-label',
          severity: 'hint',
          line,
          column: character,
          snippet: node.getText(sourceFile),
        });
      } else if (hasIdOnly && !isHidden) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        issues.push({
          message: `Form control <${tagName}> has an \`id\` but no explicit label. Ensure a \`<label htmlFor="...">\` exists, or add \`aria-label\`.`,
          rule: 'form-label',
          severity: 'hint',
          line,
          column: character,
          snippet: node.getText(sourceFile),
        });
      }
    }
  }

  return issues;
}

/** Walk up the JSX tree to check for a <FormControl> ancestor */
function hasFormControlAncestor(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      const openTag = current.openingElement.tagName.getText();
      if (openTag === 'FormControl') return true;
    }
    current = current.parent;
  }
  return false;
}
