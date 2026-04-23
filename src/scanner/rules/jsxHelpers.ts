/**
 * Shared AST helper utilities for JSX accessibility rule checks.
 *
 * Provides spread-props detection, className extraction, and attribute
 * value helpers used across multiple rules.
 */

import * as ts from 'typescript';

/* ── Spread-props detection ─────────────────────────────────────────── */

/**
 * Returns `true` if the JSX element has JSX spread attributes (`{...props}`).
 * When a spread is present, attributes may be provided dynamically and the
 * static analysis cannot determine their values — rules should use this to
 * suppress false positives.
 */
export function hasSpreadProps(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
): boolean {
  return node.attributes.properties.some(ts.isJsxSpreadAttribute);
}

/* ── Attribute value helpers ────────────────────────────────────────── */

/**
 * Get the static string value of a named JSX attribute.
 * Returns the string for `attr="value"` or `attr={"value"}`.
 * Returns `undefined` when the attribute is absent or dynamic.
 * Returns `''` for a boolean attribute with no initializer (e.g. `<img alt />`).
 */
export function getAttrStringValue(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  attrName: string,
  sf: ts.SourceFile,
): string | undefined {
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) { continue; }
    if (prop.name.getText(sf) !== attrName) { continue; }

    if (!prop.initializer) { return ''; } // boolean attribute — <img alt />
    if (ts.isStringLiteral(prop.initializer)) { return prop.initializer.text; }
    if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
      const expr = prop.initializer.expression;
      if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
        return expr.text;
      }
    }
    return undefined; // dynamic expression
  }
  return undefined; // not found
}

/**
 * Returns `true` if the named attribute exists on the element (regardless of value).
 */
export function hasAttr(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  attrName: string,
  sf: ts.SourceFile,
): boolean {
  return node.attributes.properties.some(
    prop => ts.isJsxAttribute(prop) && prop.name.getText(sf) === attrName,
  );
}

/* ── className extraction ───────────────────────────────────────────── */

/**
 * Extract the static string value of `className` or `class`.
 */
export function getClassList(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): string | undefined {
  return getAttrStringValue(node, 'className', sf)
    ?? getAttrStringValue(node, 'class', sf);
}

/**
 * Returns `true` if the element's class list contains one of the given class
 * names. Useful for detecting utility classes like `sr-only`.
 */
export function hasClass(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
  ...classNames: string[]
): boolean {
  const classList = getClassList(node, sf);
  if (!classList) { return false; }
  const classes = classList.split(/\s+/);
  return classNames.some(cn => classes.includes(cn));
}

/* ── Decorative / hidden element detection ──────────────────────────── */

/**
 * Returns `true` if the element is explicitly marked decorative / hidden
 * from the accessibility tree:
 *  - `aria-hidden="true"` or `aria-hidden={true}`
 *  - `role="presentation"`  or  `role="none"`
 */
export function isAriaHidden(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): boolean {
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) { continue; }
    const name = prop.name.getText(sf);

    if (name === 'aria-hidden') {
      if (!prop.initializer) { return true; } // aria-hidden (boolean)
      if (ts.isStringLiteral(prop.initializer) && prop.initializer.text === 'true') { return true; }
      if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
        const expr = prop.initializer.expression;
        if (expr.kind === ts.SyntaxKind.TrueKeyword) { return true; }
      }
    }

    if (name === 'role') {
      const val = getAttrStringValue(node, 'role', sf);
      if (val === 'presentation' || val === 'none') { return true; }
    }
  }
  return false;
}
