import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: form-label
 * Form inputs (<input>, <select>, <textarea>, <TextField>) should have associated labels.
 * Checks for: aria-label, aria-labelledby, id with matching htmlFor, label prop,
 * placeholder (as a fallback indicator), MUI-specific props (InputLabelProps, inputProps,
 * slotProps, slots, componentsProps — all MUI v4/v5/v6 labeling patterns),
 * and wrapping FormControl parent (standard MUI label context pattern).
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

      const attrs = node.attributes.properties;

      const hasDirectLabel = attrs.some(attr => {
        if (!ts.isJsxAttribute(attr)) return false;
        const name = attr.name.getText(sourceFile);
        return name === 'aria-label' ||
               name === 'aria-labelledby' ||
               name === 'label';
      });

      const hasPlaceholder = attrs.some(attr =>
        ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'placeholder'
      );

      const muiLabelPropNames = new Set([
        'InputLabelProps', 'inputProps', 'InputProps',
        'slotProps', 'slots', 'componentsProps',
        'renderInput',
      ]);
      const hasMuiLabelProps = isMuiInput && attrs.some(attr => {
        if (!ts.isJsxAttribute(attr)) return false;
        return muiLabelPropNames.has(attr.name.getText(sourceFile));
      });

      const hasIdOnly = !hasDirectLabel && !hasPlaceholder && !hasMuiLabelProps && attrs.some(attr =>
        ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'id'
      );

      // For hidden inputs, skip the check
      const isHidden = attrs.some(attr =>
        ts.isJsxAttribute(attr) &&
        attr.name.getText(sourceFile) === 'type' &&
        attr.initializer &&
        ts.isStringLiteral(attr.initializer) &&
        attr.initializer.text === 'hidden'
      );

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
