/**
 * Pure JSX string manipulation utilities.
 * These functions operate on raw JSX strings without any VS Code dependencies,
 * making them testable and reusable across the extension.
 */

import type { AiFixAction } from '../types';

/* ── Tag close detection ─────────────────────────────────────────────── */

/**
 * Find the closing `>` or `/>` of an opening JSX tag in a string.
 * Returns the index of `>` (or `/` for `/>`) or -1 if not found.
 */
export function findOpeningTagClose(text: string, tagStart: number): number {
  let i = tagStart;
  if (i < text.length && text[i] === '<') { i++; }
  while (i < text.length && /[a-zA-Z0-9._-]/.test(text[i])) { i++; }

  let inString: string | false = false;
  let braceDepth = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') { inString = false; }
    } else if (ch === '"' || ch === "'") {
      inString = ch;
    } else if (ch === '{') {
      braceDepth++;
    } else if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (braceDepth === 0) {
      if (ch === '/' && i + 1 < text.length && text[i + 1] === '>') { return i; }
      if (ch === '>') { return i; }
    }
    i++;
  }

  return -1;
}

/* ── Attribute manipulation ──────────────────────────────────────────── */

/** Insert an attribute before the opening tag's closing `>` or `/>`. */
export function insertAttributeIntoTag(tagText: string, attribute: string): string | null {
  const lines = tagText.split('\n');

  if (lines.length === 1) {
    const closeIdx = findOpeningTagClose(tagText, 0);
    if (closeIdx === -1) {
      return tagText + ` ${attribute}`;
    }
    return tagText.substring(0, closeIdx) + ` ${attribute}` + tagText.substring(closeIdx);
  }

  // Multiline — find prop indentation from second non-empty line
  const propLine = lines.find((l, i) => i > 0 && l.trim().length > 0 && !l.trim().startsWith('//'));
  const propIndent = propLine?.match(/^(\s*)/)?.[1] ?? '  ';

  // Find the line with the closing > or />
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === '>' || trimmed === '/>') {
      lines.splice(i, 0, propIndent + attribute);
      return lines.join('\n');
    }
    if ((trimmed.endsWith('>') && !trimmed.endsWith('}}>')) || trimmed.endsWith('/>')) {
      const lineIndent = lines[i].match(/^(\s*)/)?.[1] ?? '';
      const isSelfClose = trimmed.endsWith('/>');
      const closeLen = isSelfClose ? 2 : 1;
      const beforeClose = lines[i].substring(0, lines[i].length - closeLen).trimEnd();
      lines[i] = beforeClose;
      lines.splice(i + 1, 0, propIndent + attribute);
      lines.splice(i + 2, 0, lineIndent + (isSelfClose ? '/>' : '>'));
      return lines.join('\n');
    }
  }

  // No closing > found — append attribute before the last line
  const lastLineIdx = lines.length - 1;
  lines.splice(lastLineIdx, 0, propIndent + attribute);
  return lines.join('\n');
}

/** Modify an existing attribute's value in a JSX tag. */
export function modifyAttributeInTag(tagText: string, attrName: string, newValue: string): string | null {
  const loc = findAttributeLocation(tagText, attrName);
  if (!loc) { return null; }
  return tagText.substring(0, loc.valueStart) + newValue + tagText.substring(loc.valueEnd);
}

/** Remove an attribute from a JSX tag. */
export function removeAttributeFromTag(tagText: string, attrName: string): string | null {
  const loc = findAttributeLocation(tagText, attrName);
  if (!loc) { return null; }
  // Include leading whitespace in the removal
  let start = loc.nameStart;
  while (start > 0 && (tagText[start - 1] === ' ' || tagText[start - 1] === '\t')) { start--; }
  // If the whitespace starts at a newline, include it
  if (start > 0 && (tagText[start - 1] === '\n')) { start--; }
  if (start > 0 && tagText[start - 1] === '\r') { start--; }
  // If we'd remove from position 0, keep at least one space
  if (start === 0) { start = loc.nameStart - 1; }
  if (start < 0) { start = 0; }
  return tagText.substring(0, start) + tagText.substring(loc.valueEnd);
}

/**
 * Get the quote style used by an existing attribute in a tag.
 * Returns '"', "'", '{', or null if the attribute is not found or is boolean.
 */
function getAttributeQuoteStyle(tagText: string, attrName: string): string | null {
  const loc = findAttributeLocation(tagText, attrName);
  if (!loc || loc.valueStart === loc.valueEnd) { return null; }
  const ch = tagText[loc.valueStart];
  if (ch === '"' || ch === "'" || ch === '{') { return ch; }
  return null;
}

/**
 * Locate an attribute in a JSX tag string, properly handling nested braces and template literals.
 * Returns the start/end positions of the attribute name and value.
 */
function findAttributeLocation(
  tagText: string,
  attrName: string,
): { nameStart: number; valueStart: number; valueEnd: number } | null {
  let i = 0;
  const len = tagText.length;

  // Skip past `<TagName`
  if (i < len && tagText[i] === '<') { i++; }
  while (i < len && /[a-zA-Z0-9._-]/.test(tagText[i])) { i++; }

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(tagText[i])) { i++; }
    if (i >= len || tagText[i] === '>' || (tagText[i] === '/' && i + 1 < len && tagText[i + 1] === '>')) {
      break;
    }

    // Read attribute name
    const nameStart = i;
    while (i < len && /[\w\-.:]/i.test(tagText[i])) { i++; }
    const name = tagText.slice(nameStart, i);

    // Guarantee forward progress: if the cursor didn't advance (e.g. it's on a
    // `{` from a spread `{...props}` or other non-attribute character), skip it.
    // Without this the outer while-loop would spin forever.
    if (i === nameStart) { i++; continue; }

    // Skip whitespace
    while (i < len && /\s/.test(tagText[i])) { i++; }

    if (i < len && tagText[i] === '=') {
      i++; // skip '='
      while (i < len && /\s/.test(tagText[i])) { i++; }

      const valueStart = i;
      i = skipAttributeValue(tagText, i);
      const valueEnd = i;

      if (name === attrName) {
        return { nameStart, valueStart, valueEnd };
      }
    } else {
      // Boolean attribute (no value)
      if (name === attrName) {
        return { nameStart, valueStart: i, valueEnd: i };
      }
    }
  }

  return null;
}

/**
 * Skip over a JSX attribute value starting at position i.
 * Handles quoted strings, template literals, and nested braces/expressions.
 */
function skipAttributeValue(text: string, i: number): number {
  const len = text.length;
  if (i >= len) { return i; }

  const ch = text[i];

  // Quoted string
  if (ch === '"' || ch === "'") {
    i++;
    while (i < len && text[i] !== ch) {
      if (text[i] === '\\') { i++; }
      i++;
    }
    if (i < len) { i++; } // skip closing quote
    return i;
  }

  // JSX expression container { ... }
  if (ch === '{') {
    let depth = 0;
    let inStr: string | false = false;
    let inTemplate = false;
    let templateDepth = 0;

    while (i < len) {
      const c = text[i];
      if (inStr) {
        if (c === inStr && text[i - 1] !== '\\') { inStr = false; }
        i++;
        continue;
      }
      if (inTemplate) {
        if (c === '\\') { i += 2; continue; }
        if (c === '`' && templateDepth === 0) { inTemplate = false; i++; continue; }
        if (c === '$' && i + 1 < len && text[i + 1] === '{') { templateDepth++; i += 2; continue; }
        if (c === '}' && templateDepth > 0) { templateDepth--; i++; continue; }
        i++;
        continue;
      }
      if (c === '`') { inTemplate = true; templateDepth = 0; i++; continue; }
      if (c === '"' || c === "'") { inStr = c; i++; continue; }
      if (c === '{') { depth++; }
      else if (c === '}') {
        depth--;
        if (depth === 0) { i++; return i; }
      }
      i++;
    }
    return i;
  }

  // Bare value (shouldn't happen in valid JSX, but handle gracefully)
  while (i < len && !/[\s>]/.test(text[i])) { i++; }
  return i;
}

/** Replace a tag name in both opening and closing tags. */
export function replaceTagName(tagText: string, oldTag: string, newTag: string): string | null {
  const escapedOld = oldTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openPattern = new RegExp(`<${escapedOld}(\\s|>|/>)`);
  const closePattern = new RegExp(`</${escapedOld}\\s*>`);
  let result = tagText;
  if (openPattern.test(result)) {
    result = result.replace(openPattern, `<${newTag}$1`);
  } else {
    return null;
  }
  result = result.replace(closePattern, `</${newTag}>`);
  return result;
}

/* ── Structured action application ───────────────────────────────────── */

/** Apply structured fix actions to a JSX tag string. */
export function applyActions(tagText: string, actions: AiFixAction[]): string | null {
  let result = tagText;

  for (const action of actions) {
    switch (action.type) {
      case 'addAttribute': {
        let value = action.value;
        if (!value.startsWith('"') && !value.startsWith("'") && !value.startsWith('{') && !value.startsWith('`')) {
          value = `{${value}}`;
        }
        const attr = `${action.name}=${value}`;
        const inserted = insertAttributeIntoTag(result, attr);
        if (!inserted) { return null; }
        result = inserted;
        break;
      }
      case 'modifyAttribute': {
        let newValue = action.newValue;
        if (!newValue.startsWith('"') && !newValue.startsWith("'") && !newValue.startsWith('{') && !newValue.startsWith('`')) {
          // Preserve the original attribute's quote style if possible
          const origQuote = getAttributeQuoteStyle(result, action.name);
          if (origQuote === '"' || origQuote === "'") {
            newValue = `${origQuote}${newValue}${origQuote}`;
          } else {
            newValue = `"${newValue}"`;
          }
        }
        const modified = modifyAttributeInTag(result, action.name, newValue);
        if (!modified) { return null; }
        result = modified;
        break;
      }
      case 'removeAttribute': {
        const removed = removeAttributeFromTag(result, action.name);
        if (!removed) { return null; }
        result = removed;
        break;
      }
      case 'replaceTag': {
        const replaced = replaceTagName(result, action.oldTag, action.newTag);
        if (!replaced) { return null; }
        result = replaced;
        break;
      }
      default:
        return null;
    }
  }

  return result;
}

/* ── Fabricated-attribute detection ──────────────────────────────────── */

/**
 * Attributes that are never legitimate additions for an a11y-only fix.
 * If the original code doesn't have them and the replacement adds them, reject.
 */
const NEVER_ADD_ATTRS = new Set([
  'className', 'class', 'style',
]);

/**
 * Extract attribute names from a JSX opening tag string.
 * Handles the tag name prefix and delegates to parseJsxAttributes.
 */
function extractAttributeNamesFromTag(tagText: string): Set<string> {
  // Find end of tag name (skip `<TagName`)
  let i = 0;
  if (i < tagText.length && tagText[i] === '<') { i++; }
  while (i < tagText.length && /[a-zA-Z0-9._-]/.test(tagText[i])) { i++; }

  const attrText = tagText.substring(i);
  const attrs = parseJsxAttributes(attrText);
  const names = new Set<string>();

  for (const attr of attrs) {
    const eqIdx = attr.indexOf('=');
    const name = eqIdx >= 0 ? attr.substring(0, eqIdx).trim() : attr.trim();
    if (name) { names.add(name); }
  }

  return names;
}

/**
 * Detect if the AI replacement added attributes that weren't in the original
 * and aren't accessibility-related.  Catches hallucinated className, style,
 * and event handlers with placeholder comments.
 *
 * Returns the name of the first fabricated attribute found, or null if clean.
 */
export function findFabricatedAttribute(original: string, replacement: string): string | null {
  // Extract just the opening tag portion from both strings
  const origClose = findOpeningTagClose(original, 0);
  const replClose = findOpeningTagClose(replacement, 0);
  const origTag = origClose >= 0 ? original.substring(0, origClose + 1) : original;
  const replTag = replClose >= 0 ? replacement.substring(0, replClose + 1) : replacement;

  const origNames = extractAttributeNamesFromTag(origTag);
  const replNames = extractAttributeNamesFromTag(replTag);

  // Check for attributes that should never be added by an a11y fix
  for (const attr of replNames) {
    if (origNames.has(attr)) { continue; }
    if (NEVER_ADD_ATTRS.has(attr)) { return attr; }
  }

  // Check for new event handlers containing placeholder comments
  const handlerPattern = /\b(on[A-Z]\w+)=\{[^}]*\/\*[^*]*\*\/[^}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = handlerPattern.exec(replTag)) !== null) {
    const handlerName = m[1];
    if (!origNames.has(handlerName)) { return `${handlerName} (placeholder)`; }
  }

  return null;
}

/* ── JSX post-processing ─────────────────────────────────────────────── */

/** Strip everything after the opening tag's closing `>` or `/>`. */
export function stripAfterOpeningTagClose(tagText: string): string {
  let inString: string | false = false;
  let braceDepth = 0;
  let pastTagName = false;

  for (let i = 0; i < tagText.length; i++) {
    const ch = tagText[i];

    if (!pastTagName) {
      if (ch === '<') { continue; }
      if (/[a-zA-Z0-9._-]/.test(ch)) { continue; }
      pastTagName = true;
    }

    if (inString) {
      if (ch === inString && (i === 0 || tagText[i - 1] !== '\\')) {
        inString = false;
      }
    } else if (ch === '"' || ch === "'") {
      inString = ch;
    } else if (ch === '`') {
      i++;
      let tplDepth = 0;
      while (i < tagText.length) {
        if (tagText[i] === '\\') { i += 2; continue; }
        if (tagText[i] === '`' && tplDepth === 0) { break; }
        if (tagText[i] === '$' && i + 1 < tagText.length && tagText[i + 1] === '{') {
          tplDepth++;
          i += 2;
          continue;
        }
        if (tagText[i] === '}' && tplDepth > 0) { tplDepth--; }
        i++;
      }
    } else if (ch === '{') {
      braceDepth++;
    } else if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (braceDepth === 0) {
      if (ch === '/' && i + 1 < tagText.length && tagText[i + 1] === '>') {
        return tagText.substring(0, i + 2);
      }
      if (ch === '>') {
        return tagText.substring(0, i + 1);
      }
    }
  }

  return tagText;
}

/** Parse JSX attributes from a string, handling nested braces and template literals. */
export function parseJsxAttributes(text: string): string[] {
  const attrs: string[] = [];
  let i = 0;
  const len = text.length;

  while (i < len && /\s/.test(text[i])) { i++; }

  while (i < len) {
    if (text[i] === '/' || text[i] === '>') { break; }

    const nameStart = i;
    while (i < len && /[\w\-.:]/.test(text[i])) { i++; }
    if (i === nameStart) { i++; continue; }

    while (i < len && /\s/.test(text[i])) { i++; }

    if (i < len && text[i] === '=') {
      i++;
      while (i < len && /\s/.test(text[i])) { i++; }

      if (text[i] === '"' || text[i] === "'") {
        const quote = text[i];
        i++;
        while (i < len && text[i] !== quote) {
          if (text[i] === '\\') { i++; }
          i++;
        }
        if (i < len) { i++; }
      } else if (text[i] === '{') {
        let depth = 0;
        let inStr: string | false = false;
        let inTemplate = false;

        while (i < len) {
          const ch = text[i];
          if (inStr) {
            if (ch === inStr && (i === 0 || text[i - 1] !== '\\')) { inStr = false; }
            i++;
            continue;
          }
          if (inTemplate) {
            if (ch === '`' && text[i - 1] !== '\\') { inTemplate = false; i++; continue; }
            if (ch === '$' && i + 1 < len && text[i + 1] === '{') { depth++; i += 2; continue; }
            i++;
            continue;
          }
          if (ch === '`') { inTemplate = true; i++; continue; }
          if (ch === '"' || ch === "'") { inStr = ch; i++; continue; }
          if (ch === '{') { depth++; }
          else if (ch === '}') {
            depth--;
            if (depth === 0) { i++; break; }
          }
          i++;
        }
      }

      attrs.push(text.slice(nameStart, i).trim());
    } else {
      attrs.push(text.slice(nameStart, i).trim());
    }

    while (i < len && /\s/.test(text[i])) { i++; }
  }

  return attrs;
}

/**
 * Post-process an AI's fixedCode to match the original's indentation and structure.
 * Used by the single-fix code action pipeline.
 */
export function computeSafeReplacement(original: string, aiFixedCode: string): string {
  const origLines = original.split('\n');
  const fixedLines = aiFixedCode.split('\n');

  if (fixedLines.length === 0) { return original; }

  const origFirstNonEmpty = origLines.find(l => l.trim().length > 0) ?? origLines[0];
  const fixedFirstNonEmpty = fixedLines.find(l => l.trim().length > 0) ?? fixedLines[0];
  const origIndent = origFirstNonEmpty.match(/^(\s*)/)?.[1] ?? '';
  const fixedIndent = fixedFirstNonEmpty.match(/^(\s*)/)?.[1] ?? '';

  let result = aiFixedCode;
  if (origIndent !== fixedIndent) {
    const delta = origIndent.length - fixedIndent.length;
    const indentChar = origIndent.includes('\t') ? '\t' : ' ';

    result = fixedLines.map(line => {
      if (line.trim() === '') { return line; }
      const currentIndent = (line.match(/^(\s*)/)?.[1] ?? '').length;
      const newLen = Math.max(0, currentIndent + delta);
      return indentChar.repeat(newLen) + line.trimStart();
    }).join('\n');
  }

  if (origLines.length === 1) {
    const collapsed = result.split('\n').map(l => l.trim()).filter(Boolean).join(' ');
    const closeIdx = findOpeningTagClose(collapsed, 0);
    if (closeIdx !== -1) {
      const endIdx = collapsed[closeIdx] === '/' ? closeIdx + 2 : closeIdx + 1;
      return origIndent + collapsed.substring(0, endIdx);
    }
    return origIndent + collapsed;
  }

  // Multiline: split inline-appended attributes onto their own lines
  if (origLines.length > 1) {
    const resultLines = result.split('\n');
    const origTagLine = origLines[0].trim();
    const propLine = origLines.find((l, i) => i > 0 && l.trim().length > 0 && !l.trim().startsWith('//'));
    const propIndent = propLine?.match(/^(\s*)/)?.[1] ?? (origIndent + '  ');

    const fixedResult: string[] = [];
    for (const line of resultLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith(origTagLine) && trimmed.length > origTagLine.length) {
        const appended = trimmed.slice(origTagLine.length);
        const splitAttrs = parseJsxAttributes(appended);
        if (splitAttrs.length > 0) {
          fixedResult.push(origLines[0]);
          for (const attr of splitAttrs) {
            fixedResult.push(propIndent + attr);
          }
          continue;
        }
      }
      fixedResult.push(line);
    }
    result = fixedResult.join('\n');
    result = stripAfterOpeningTagClose(result);
  }

  return result;
}

/* ── Utility ─────────────────────────────────────────────────────────── */

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
