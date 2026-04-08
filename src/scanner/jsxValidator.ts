/**
 * JSX syntax validation — validates AI-generated JSX code for structural
 * correctness before applying fixes.
 */

import * as ts from 'typescript';

/**
 * Validate that a JSX/TSX code snippet is syntactically valid.
 * Uses the TypeScript compiler to parse the snippet as TSX and checks for
 * syntax diagnostics. Returns an object with a `valid` flag and any error messages.
 */
export function validateJsxSyntax(code: string): { valid: boolean; errors: string[] } {
  // Wrap in a minimal function body so the TS parser accepts standalone JSX fragment
  const wrapped = `function __a11yValidation__() { return (\n${code}\n); }`;
  const sourceFile = ts.createSourceFile(
    '__validation__.tsx',
    wrapped,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const errors: string[] = [];

  // Check for parseDiagnostics (TypeScript internal — catches syntax errors)
  const parseDiags = (sourceFile as any).parseDiagnostics;
  if (parseDiags && Array.isArray(parseDiags)) {
    for (const diag of parseDiags) {
      const msg = typeof diag.messageText === 'string' ? diag.messageText : diag.messageText?.messageText ?? '';
      errors.push(msg);
    }
  }

  // Additional structural checks
  const structuralErrors = validateJsxStructure(code);
  errors.push(...structuralErrors);

  return { valid: errors.length === 0, errors };
}

/**
 * Structural checks for common AI-generated JSX mistakes:
 * - Unbalanced braces / brackets / parens
 * - Unclosed string literals
 * - Unclosed JSX expressions
 * - Orphaned attribute values across lines
 * - Missing closing tags
 */
function validateJsxStructure(code: string): string[] {
  const errors: string[] = [];

  // 1. Balanced braces, brackets, parens — using a proper stack for template literals
  let braces = 0, brackets = 0, parens = 0;
  let inString: string | false = false;
  const templateStack: number[] = [];
  let inTemplateLiteral = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';

    if (inString) {
      if (ch === inString && prev !== '\\') { inString = false; }
      continue;
    }

    if (inTemplateLiteral) {
      if (ch === '\\') { i++; continue; }
      if (ch === '`') {
        inTemplateLiteral = false;
        continue;
      }
      if (ch === '$' && i + 1 < code.length && code[i + 1] === '{') {
        templateStack.push(braces);
        braces++;
        i++;
        inTemplateLiteral = false;
        continue;
      }
      continue;
    }

    if (ch === '`') { inTemplateLiteral = true; continue; }
    if (ch === '"' || ch === "'") { inString = ch; continue; }
    if (ch === '{') { braces++; }
    else if (ch === '}') {
      braces--;
      if (templateStack.length > 0 && braces === templateStack[templateStack.length - 1]) {
        templateStack.pop();
        inTemplateLiteral = true;
      }
    }
    else if (ch === '[') { brackets++; }
    else if (ch === ']') { brackets--; }
    else if (ch === '(') { parens++; }
    else if (ch === ')') { parens--; }

    if (braces < 0) { errors.push('Unbalanced closing brace }'); break; }
    if (brackets < 0) { errors.push('Unbalanced closing bracket ]'); break; }
    if (parens < 0) { errors.push('Unbalanced closing paren )'); break; }
  }

  if (inString) { errors.push('Unclosed string literal'); }
  if (inTemplateLiteral) { errors.push('Unclosed template string'); }
  if (braces > 0) { errors.push(`${braces} unclosed brace(s) {`); }
  if (brackets > 0) { errors.push(`${brackets} unclosed bracket(s) [`); }
  if (parens > 0) { errors.push(`${parens} unclosed paren(s) (`); }

  // 2. Check for orphaned attribute values (common AI mistake)
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (i > 0 && /^[a-z][a-zA-Z]*$/.test(trimmed)) {
      const prevTrimmed = lines[i - 1].trim();
      if (prevTrimmed.endsWith('=') || prevTrimmed.match(/=\s*$/)) {
        errors.push(`Line ${i + 1}: Orphaned attribute value "${trimmed}" — attribute split across lines`);
      }
    }
  }

  // 3. Check for JSX opening tags that never close
  let openTags = 0;
  let closeTags = 0;
  const tagOpenRe = /<([A-Za-z][A-Za-z0-9.]*)/g;
  const tagCloseRe = /<\/([A-Za-z][A-Za-z0-9.]*)\s*>/g;
  const selfCloseRe = /\/\s*>/g;
  while (tagOpenRe.exec(code) !== null) { openTags++; }
  while (tagCloseRe.exec(code) !== null) { closeTags++; }
  let selfCloseCount = 0;
  while (selfCloseRe.exec(code) !== null) { selfCloseCount++; }

  const expectedClosures = closeTags + selfCloseCount;
  if (openTags > expectedClosures + 1) {
    errors.push(`${openTags - expectedClosures} JSX tag(s) appear to be unclosed`);
  }

  return errors;
}
