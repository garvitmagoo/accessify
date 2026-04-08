import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * Rule: autocomplete-valid
 * WCAG 1.3.5 — Input fields collecting personal data must have a valid
 * `autocomplete` attribute so user agents can auto-fill them.
 */

const PERSONAL_INPUT_TYPES = new Set([
  'text', 'email', 'tel', 'url', 'password', 'search',
]);

const PERSONAL_NAME_PATTERNS = /(name|email|phone|tel|address|street|city|state|zip|postal|country|username|password|url|birthday|bday|cc-|credit)/i;

const VALID_AUTOCOMPLETE_TOKENS = new Set([
  'name', 'honorific-prefix', 'given-name', 'additional-name', 'family-name', 'honorific-suffix',
  'nickname', 'email', 'username', 'new-password', 'current-password', 'one-time-code',
  'organization-title', 'organization', 'street-address', 'address-line1', 'address-line2',
  'address-line3', 'address-level4', 'address-level3', 'address-level2', 'address-level1',
  'country', 'country-name', 'postal-code', 'cc-name', 'cc-given-name', 'cc-additional-name',
  'cc-family-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type',
  'transaction-currency', 'transaction-amount', 'language', 'bday', 'bday-day', 'bday-month',
  'bday-year', 'sex', 'tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local',
  'tel-extension', 'impp', 'url', 'photo',
  'off', 'on',
]);

export function checkAutocompleteValid(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  const tagName = node.tagName.getText(sourceFile).toLowerCase();
  if (tagName !== 'input') { return issues; }

  const attrs = node.attributes.properties;

  const typeAttr = attrs.find(a =>
    ts.isJsxAttribute(a) && a.name.getText(sourceFile) === 'type',
  );
  const inputType = typeAttr && ts.isJsxAttribute(typeAttr) && typeAttr.initializer && ts.isStringLiteral(typeAttr.initializer)
    ? typeAttr.initializer.text.toLowerCase()
    : 'text';

  if (!PERSONAL_INPUT_TYPES.has(inputType)) { return issues; }

  const nameAttr = attrs.find(a =>
    ts.isJsxAttribute(a) && (a.name.getText(sourceFile) === 'name' || a.name.getText(sourceFile) === 'id'),
  );
  const nameValue = nameAttr && ts.isJsxAttribute(nameAttr) && nameAttr.initializer && ts.isStringLiteral(nameAttr.initializer)
    ? nameAttr.initializer.text
    : '';

  const looksPersonal = PERSONAL_NAME_PATTERNS.test(nameValue) || inputType === 'email' || inputType === 'tel' || inputType === 'password';
  if (!looksPersonal) { return issues; }

  const autocompleteAttr = attrs.find(a =>
    ts.isJsxAttribute(a) && a.name.getText(sourceFile) === 'autoComplete',
  );

  if (!autocompleteAttr) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    issues.push({
      message: `Input collecting personal data should have an \`autoComplete\` attribute (WCAG 1.3.5).`,
      rule: 'autocomplete-valid',
      severity: 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
    });
    return issues;
  }

  if (ts.isJsxAttribute(autocompleteAttr) && autocompleteAttr.initializer && ts.isStringLiteral(autocompleteAttr.initializer)) {
    const value = autocompleteAttr.initializer.text.trim().toLowerCase();
    const tokens = value.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    if (lastToken && !VALID_AUTOCOMPLETE_TOKENS.has(lastToken)) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      issues.push({
        message: `Invalid autoComplete value "${value}". Must be a valid WCAG autocomplete token.`,
        rule: 'autocomplete-valid',
        severity: 'warning',
        line,
        column: character,
        snippet: node.getText(sourceFile),
      });
    }
  }

  return issues;
}
