import * as ts from 'typescript';
import type { A11yIssue } from '../../types';
import { extractTailwindColors, suggestAccessibleTailwindClass } from './tailwindColors';

/**
 * Rule: color-contrast
 * Detects foreground and background color pairs that fail WCAG 2.1 AA
 * contrast ratio (≥ 4.5 for normal text, ≥ 3.0 for large text).
 *
 * Color sources (checked in order of precedence):
 *  1. Inline JSX styles — `style={{ color: "...", backgroundColor: "..." }}`
 *  2. Class-based / Tailwind utilities — `className="text-white bg-red-500"`
 *     Supports text-{color}-{shade}, bg-{color}-{shade}, arbitrary values
 *     like text-[#hex] / bg-[rgb(...)], and the full Tailwind v3 palette.
 *
 * Supported color formats:
 *  - Named CSS colors (common set)
 *  - Hex (#RGB, #RRGGBB, #RRGGBBAA)
 *  - rgb() / rgba()
 */

/* ── Color utilities ────────────────────────────────────────────────────── */

export interface RGB { r: number; g: number; b: number }

const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000',
  blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000',
  navy: '#000080', teal: '#008080', aqua: '#00ffff', fuchsia: '#ff00ff',
  lime: '#00ff00', olive: '#808000', darkred: '#8b0000', darkgreen: '#006400',
  darkblue: '#00008b', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3', lightgrey: '#d3d3d3', lightblue: '#add8e6',
  lightgreen: '#90ee90', coral: '#ff7f50', crimson: '#dc143c',
  gold: '#ffd700', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c',
  lavender: '#e6e6fa', pink: '#ffc0cb', salmon: '#fa8072', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
  whitesmoke: '#f5f5f5', chocolate: '#d2691e', cornflowerblue: '#6495ed',
  cyan: '#00ffff', dimgray: '#696969', dimgrey: '#696969',
  firebrick: '#b22222', forestgreen: '#228b22', gainsboro: '#dcdcdc',
  hotpink: '#ff69b4', indianred: '#cd5c5c', lemonchiffon: '#fffacd',
  magenta: '#ff00ff', midnightblue: '#191970', orangered: '#ff4500',
  orchid: '#da70d6', peru: '#cd853f', plum: '#dda0dd', royalblue: '#4169e1',
  sienna: '#a0522d', skyblue: '#87ceeb', slategray: '#708090',
  slategrey: '#708090', steelblue: '#4682b4', tan: '#d2b48c',
};

export function parseColor(value: string): RGB | null {
  const v = value.trim().toLowerCase();

  // Named color
  if (NAMED_COLORS[v]) {
    return parseHex(NAMED_COLORS[v]);
  }

  // Hex
  if (v.startsWith('#')) {
    return parseHex(v);
  }

  // rgb(r, g, b) / rgba(r, g, b, a) — blend against white if alpha < 1
  const rgbMatch = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    const r = clamp(+rgbMatch[1]), g = clamp(+rgbMatch[2]), b = clamp(+rgbMatch[3]);
    const a = rgbMatch[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgbMatch[4]))) : 1;
    if (a < 1) {
      return { r: Math.round(a * r + (1 - a) * 255), g: Math.round(a * g + (1 - a) * 255), b: Math.round(a * b + (1 - a) * 255) };
    }
    return { r, g, b };
  }

  return null;
}

function parseHex(hex: string): RGB | null {
  let h = hex.replace('#', '');
  if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
  if (h.length === 8) {
    // Blend against white background instead of discarding alpha
    const a = parseInt(h.slice(6, 8), 16) / 255;
    return {
      r: Math.round(a * parseInt(h.slice(0, 2), 16) + (1 - a) * 255),
      g: Math.round(a * parseInt(h.slice(2, 4), 16) + (1 - a) * 255),
      b: Math.round(a * parseInt(h.slice(4, 6), 16) + (1 - a) * 255),
    };
  }
  if (h.length !== 6) { return null; }
  const n = parseInt(h, 16);
  if (isNaN(n)) { return null; }
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function clamp(n: number): number { return Math.max(0, Math.min(255, n)); }

/**
 * Relative luminance per WCAG 2.1 definition.
 */
export function relativeLuminance(c: RGB): number {
  const srgb = [c.r / 255, c.g / 255, c.b / 255].map(v =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/* ── Color adjustment for auto-fix ──────────────────────────────────────── */

interface HSL { h: number; s: number; l: number }

function rgbToHsl(c: RGB): HSL {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) { return { h: 0, s: 0, l }; }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) { h = ((g - b) / d + (g < b ? 6 : 0)) / 6; }
  else if (max === g) { h = ((b - r) / d + 2) / 6; }
  else { h = ((r - g) / d + 4) / 6; }
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) { t += 1; } if (t > 1) { t -= 1; }
  if (t < 1 / 6) { return p + (q - p) * 6 * t; }
  if (t < 1 / 2) { return q; }
  if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
  return p;
}

function hslToRgb(c: HSL): RGB {
  if (c.s === 0) {
    const v = Math.round(c.l * 255);
    return { r: v, g: v, b: v };
  }
  const q = c.l < 0.5 ? c.l * (1 + c.s) : c.l + c.s - c.l * c.s;
  const p = 2 * c.l - q;
  return {
    r: Math.round(hue2rgb(p, q, c.h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, c.h) * 255),
    b: Math.round(hue2rgb(p, q, c.h - 1 / 3) * 255),
  };
}

function rgbToHex(c: RGB): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

/**
 * Suggests an accessible foreground color that achieves ≥ 4.5:1 contrast
 * against the given background, preserving the original hue and saturation.
 */
export function suggestAccessibleForeground(fgColor: string, bgColor: string): string | null {
  const fg = parseColor(fgColor);
  const bg = parseColor(bgColor);
  if (!fg || !bg) { return null; }

  // Already passes
  if (contrastRatio(fg, bg) >= 4.5) { return null; }

  const bgLum = relativeLuminance(bg);
  const hsl = rgbToHsl(fg);

  // Move lightness away from background: darken for light bg, lighten for dark bg
  const goDarker = bgLum > 0.179;

  let lo: number, hi: number;
  if (goDarker) { lo = 0; hi = hsl.l; }
  else { lo = hsl.l; hi = 1; }

  let bestColor: RGB | null = null;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const testRgb = hslToRgb({ h: hsl.h, s: hsl.s, l: mid });
    const ratio = contrastRatio(testRgb, bg);

    if (ratio >= 4.5) {
      bestColor = testRgb;
      // Stay as close to original lightness as possible
      if (goDarker) { lo = mid; } else { hi = mid; }
    } else {
      if (goDarker) { hi = mid; } else { lo = mid; }
    }
  }

  if (!bestColor) {
    // Fallback to black or white
    if (contrastRatio({ r: 0, g: 0, b: 0 }, bg) >= 4.5) { return '#000000'; }
    return '#ffffff';
  }

  return rgbToHex(bestColor);
}

/* ── AST helpers ────────────────────────────────────────────────────────── */

function isDisabled(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): boolean {
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) { continue; }
    const name = prop.name.getText(sf);
    if (name === 'disabled') { return true; }
    if (name === 'aria-disabled') {
      if (!prop.initializer) { return true; }
      if (ts.isStringLiteral(prop.initializer) && prop.initializer.text === 'true') { return true; }
      if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
        if (prop.initializer.expression.kind === ts.SyntaxKind.TrueKeyword) { return true; }
      }
    }
  }
  return false;
}

const FG_KEYS = new Set(['color']);
const BG_KEYS = new Set(['backgroundColor', 'background']);

/**
 * Given a JSX `style={{ ... }}` expression, extract color strings for
 * foreground, background, and opacity.
 */
function extractInlineColors(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): { fg?: string; bg?: string; opacity?: number; fgNode?: ts.Node; bgNode?: ts.Node } {
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop) || prop.name.getText(sf) !== 'style') { continue; }
    if (!prop.initializer || !ts.isJsxExpression(prop.initializer)) { continue; }
    const expr = prop.initializer.expression;
    if (!expr || !ts.isObjectLiteralExpression(expr)) { continue; }

    let fg: string | undefined;
    let bg: string | undefined;
    let opacity: number | undefined;
    let fgNode: ts.Node | undefined;
    let bgNode: ts.Node | undefined;

    for (const p of expr.properties) {
      if (!ts.isPropertyAssignment(p)) { continue; }
      const key = p.name.getText(sf);

      let val: string | undefined;
      if (ts.isStringLiteral(p.initializer)) {
        val = p.initializer.text;
      } else if (ts.isTemplateExpression(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer)) {
        val = undefined; // template literals are dynamic — skip
      }

      if (val !== undefined) {
        if (FG_KEYS.has(key)) { fg = val; fgNode = p; }
        if (BG_KEYS.has(key)) { bg = val; bgNode = p; }
      }

      if (key === 'opacity') {
        if (ts.isNumericLiteral(p.initializer)) {
          opacity = parseFloat(p.initializer.text);
        } else if (ts.isStringLiteral(p.initializer)) {
          const n = parseFloat(p.initializer.text);
          if (!isNaN(n)) { opacity = n; }
        }
      }
    }

    return { fg, bg, opacity, fgNode, bgNode };
  }
  return {};
}

/**
 * Extract the string value of a `className` or `class` JSX attribute.
 */
function getClassNameValue(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): string | undefined {
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) { continue; }
    const name = prop.name.getText(sf);
    if (name !== 'className' && name !== 'class') { continue; }
    if (!prop.initializer) { continue; }

    // className="..."
    if (ts.isStringLiteral(prop.initializer)) {
      return prop.initializer.text;
    }

    // className={"..."}
    if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
      const expr = prop.initializer.expression;
      if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
        return expr.text;
      }
    }
  }
  return undefined;
}

/**
 * Determine whether a JSX element declares a background, and resolve its color
 * when statically possible. `declared` is true when the element sets ANY
 * background (inline `backgroundColor` / `background`, or a `bg-*` class) even
 * if the value can't be resolved — this lets the ancestor walk stop at the
 * nearest background-bearing element rather than reaching past it.
 */
function getElementBackgroundInfo(
  el: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): { declared: boolean; value?: string } {
  // Inline style background
  for (const prop of el.attributes.properties) {
    if (!ts.isJsxAttribute(prop) || prop.name.getText(sf) !== 'style') { continue; }
    if (!prop.initializer || !ts.isJsxExpression(prop.initializer)) { continue; }
    const expr = prop.initializer.expression;
    if (!expr || !ts.isObjectLiteralExpression(expr)) { continue; }
    for (const p of expr.properties) {
      if (!ts.isPropertyAssignment(p)) { continue; }
      if (!BG_KEYS.has(p.name.getText(sf))) { continue; }
      const val = ts.isStringLiteral(p.initializer) ? p.initializer.text : undefined;
      return { declared: true, value: val };
    }
  }

  // className background
  const classList = getClassNameValue(el, sf);
  if (classList) {
    const tw = extractTailwindColors(classList);
    if (tw.bg) { return { declared: true, value: tw.bg }; }
    // A `bg-*` utility is present but couldn't be resolved (gradient, CSS var,
    // arbitrary non-color value, etc.) — treat as declared-but-unresolvable.
    if (/(?:^|\s)bg-\S+/.test(classList)) { return { declared: true, value: undefined }; }
  }

  return { declared: false };
}

/**
 * Walk up the JSX ancestor chain to find the background the element actually
 * renders against. CSS backgrounds paint behind descendants, so the nearest
 * ancestor that sets a background is the effective background for this element.
 *
 * Stops at the FIRST ancestor that declares a background:
 *  - resolvable    → returns that color
 *  - unresolvable  → returns `undefined` (we refuse to guess past a nearer,
 *                    dynamic background, which keeps us free of false positives)
 */
function findAncestorBackground(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): string | undefined {
  const MAX_DEPTH = 30;
  let current: ts.Node | undefined = node.parent;
  let depth = 0;

  while (current && depth < MAX_DEPTH) {
    if (ts.isJsxElement(current) && current.openingElement !== node) {
      const info = getElementBackgroundInfo(current.openingElement, sf);
      if (info.declared) { return info.value; }
    }
    current = current.parent;
    depth++;
  }

  return undefined;
}

/**
 * Extract foreground and background colors from a JSX element.
 * Checks inline styles first, then falls back to className-based
 * Tailwind / utility-class parsing. Inline styles take precedence
 * (matching browser specificity behaviour).
 */
function extractColors(
  node: ts.JsxSelfClosingElement | ts.JsxOpeningElement,
  sf: ts.SourceFile,
): { fg?: string; bg?: string; opacity?: number; source: 'inline' | 'class'; fgClass?: string; bgClass?: string; bgInherited?: boolean } {
  const inline = extractInlineColors(node, sf);
  if (inline.fg && inline.bg) {
    return { fg: inline.fg, bg: inline.bg, opacity: inline.opacity, source: 'inline' };
  }

  // Try className / Tailwind utilities
  const classList = getClassNameValue(node, sf);
  const tw = classList ? extractTailwindColors(classList) : { fg: undefined, bg: undefined, fgClass: undefined, bgClass: undefined };

  // Merge — inline styles override class-based colors
  const fg = inline.fg ?? tw.fg;
  let bg = inline.bg ?? tw.bg;
  let bgInherited = false;

  // The element sets a foreground but no background of its own. Resolve the
  // background it actually renders against by walking up the JSX tree.
  if (fg && !bg) {
    const ancestorBg = findAncestorBackground(node, sf);
    if (ancestorBg) {
      bg = ancestorBg;
      bgInherited = true;
    }
  }

  const source: 'inline' | 'class' = (!inline.fg && !inline.bg && (tw.fg || tw.bg)) ? 'class' : 'inline';

  return { fg, bg, opacity: inline.opacity, source, fgClass: tw.fgClass, bgClass: tw.bgClass, bgInherited };
}

function blendAgainstWhite(c: RGB, alpha: number): RGB {
  return {
    r: Math.round(alpha * c.r + (1 - alpha) * 255),
    g: Math.round(alpha * c.g + (1 - alpha) * 255),
    b: Math.round(alpha * c.b + (1 - alpha) * 255),
  };
}

/* ── Rule entry point ───────────────────────────────────────────────────── */

export function checkColorContrast(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
  const issues: A11yIssue[] = [];

  if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) {
    return issues;
  }

  // Disabled elements are exempt from contrast requirements (WCAG 1.4.3)
  if (isDisabled(node, sourceFile)) {
    return issues;
  }

  const { fg, bg, opacity, source, fgClass, bgClass, bgInherited } = extractColors(node, sourceFile);

  // We can only check when both colors are statically resolvable
  if (!fg || !bg) { return issues; }

  const fgRgb = parseColor(fg);
  const bgRgb = parseColor(bg);
  if (!fgRgb || !bgRgb) { return issues; }

  // When `opacity` is set on the element, both fg and bg are composited against
  // the page background (assumed white). Blend before checking contrast.
  const hasOpacity = opacity !== undefined && opacity < 1;
  const effectiveFgRgb = hasOpacity ? blendAgainstWhite(fgRgb, opacity!) : fgRgb;
  const effectiveBgRgb = hasOpacity ? blendAgainstWhite(bgRgb, opacity!) : bgRgb;

  const ratio = contrastRatio(effectiveFgRgb, effectiveBgRgb);
  const ratioStr = ratio.toFixed(2);

  // WCAG AA requires ≥ 4.5 for normal text
  if (ratio < 4.5) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const via = source === 'class' ? ' (via class utilities)' : '';
    const inheritedNote = bgInherited ? ', inherited from an ancestor' : '';

    // Build suggestion info
    const data: Record<string, string> = { foreground: fg, background: bg, source };
    if (bgInherited) { data.bgInherited = 'true'; }
    let suggestion = '';

    if (hasOpacity) {
      data.hasOpacity = 'true';
      data.opacity = String(opacity);
      // Check if even pure black text (after opacity blending) can achieve 4.5:1
      const blackEffective = blendAgainstWhite({ r: 0, g: 0, b: 0 }, opacity!);
      const maxContrast = contrastRatio(blackEffective, effectiveBgRgb);
      if (maxContrast < 4.5) {
        data.opacityUnfixable = 'true';
        suggestion = ` With \`opacity: ${opacity}\`, no text color can achieve 4.5:1. Remove \`opacity\` or use \`rgba()\` for background transparency instead.`;
      } else {
        // Find a raw fg color such that blend(raw, opacity) achieves 4.5:1 against effectiveBg
        const effectiveBgHex = `#${effectiveBgRgb.r.toString(16).padStart(2,'0')}${effectiveBgRgb.g.toString(16).padStart(2,'0')}${effectiveBgRgb.b.toString(16).padStart(2,'0')}`;
        const effectiveFgHex = `#${effectiveFgRgb.r.toString(16).padStart(2,'0')}${effectiveFgRgb.g.toString(16).padStart(2,'0')}${effectiveFgRgb.b.toString(16).padStart(2,'0')}`;
        const workingEffectiveFg = suggestAccessibleForeground(effectiveFgHex, effectiveBgHex);
        if (workingEffectiveFg) {
          const wef = parseColor(workingEffectiveFg)!;
          const rawR = Math.max(0, Math.min(255, Math.round((wef.r - (1 - opacity!) * 255) / opacity!)));
          const rawG = Math.max(0, Math.min(255, Math.round((wef.g - (1 - opacity!) * 255) / opacity!)));
          const rawB = Math.max(0, Math.min(255, Math.round((wef.b - (1 - opacity!) * 255) / opacity!)));
          const rawHex = `#${rawR.toString(16).padStart(2,'0')}${rawG.toString(16).padStart(2,'0')}${rawB.toString(16).padStart(2,'0')}`;
          data.suggestedForeground = rawHex;
          suggestion = ` Suggested fix: change foreground to "${rawHex}" (accounts for opacity ${opacity}).`;
        }
      }
    } else if (source === 'class' && fgClass) {
      data.fgClass = fgClass;
      if (bgClass) { data.bgClass = bgClass; }
      const suggestedClass = suggestAccessibleTailwindClass(fgClass, bg, parseColor, contrastRatio);
      if (suggestedClass) {
        data.suggestedFgClass = suggestedClass;
        suggestion = ` Suggested fix: replace "${fgClass}" with "${suggestedClass}".`;
      }
    } else if (source === 'inline') {
      const fixedFg = suggestAccessibleForeground(fg, bg);
      if (fixedFg) {
        data.suggestedForeground = fixedFg;
        suggestion = ` Suggested fix: change foreground to "${fixedFg}".`;
      }
    }

    issues.push({
      message: `Insufficient color contrast — ratio ${ratioStr}:1 (foreground: "${fg}", background: "${bg}"${inheritedNote}${hasOpacity ? `, opacity: ${opacity}` : ''})${via}. WCAG AA requires ≥ 4.5:1 for normal text.${suggestion}`,
      rule: 'color-contrast',
      severity: ratio < 3 ? 'error' : 'warning',
      line,
      column: character,
      snippet: node.getText(sourceFile),
      data,
    });
  }

  return issues;
}
