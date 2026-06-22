import * as ts from 'typescript';
import type { A11yIssue } from '../../types';

/**
 * File-level rule emitting two rule IDs:
 *  - `no-duplicate-id`  (WCAG 4.1.1) — every `id` in a document must be unique.
 *    Duplicates break `aria-labelledby`, `aria-controls`, `htmlFor`, anchors, etc.
 *  - `aria-valid-ref`   (WCAG 1.3.1 / 4.1.2) — `aria-labelledby`, `aria-describedby`,
 *    and `aria-controls` must reference IDs that actually exist in the file.
 *
 * Like `heading-order`, this collects state across nodes and emits results on
 * the final SourceFile pass. Reference checks are suppressed when the file
 * contains any dynamic `id` (e.g. `id={genId()}`) since those can't be resolved
 * statically.
 */

interface IdOccurrence {
  id: string;
  line: number;
  column: number;
  snippet: string;
}

interface RefOccurrence {
  attr: string;
  ids: string[];
  line: number;
  column: number;
  snippet: string;
}

const REF_ATTRS = ['aria-labelledby', 'aria-describedby', 'aria-controls'];

export function createIdValidationChecker(): (node: ts.Node, sourceFile: ts.SourceFile) => A11yIssue[] {
  let lastFile: string | undefined;
  let ids: IdOccurrence[] = [];
  let refs: RefOccurrence[] = [];
  let hasDynamicId = false;

  function reset() {
    ids = [];
    refs = [];
    hasDynamicId = false;
  }

  return function checkIdValidation(node: ts.Node, sourceFile: ts.SourceFile): A11yIssue[] {
    if (sourceFile.fileName !== lastFile) {
      lastFile = sourceFile.fileName;
      reset();
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      collect(node, sourceFile);
    }

    if (node.kind !== ts.SyntaxKind.SourceFile) {
      return [];
    }

    const result = validate(ids, refs, hasDynamicId);
    reset();
    return result;
  };

  function collect(
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    sf: ts.SourceFile,
  ) {
    for (const prop of node.attributes.properties) {
      if (!ts.isJsxAttribute(prop)) { continue; }
      const name = prop.name.getText(sf);

      if (name === 'id') {
        const value = staticString(prop.initializer);
        if (value === undefined) {
          hasDynamicId = true;
        } else if (value.trim() !== '') {
          const { line, character } = sf.getLineAndCharacterOfPosition(prop.getStart(sf));
          ids.push({ id: value.trim(), line, column: character, snippet: node.getText(sf) });
        }
        continue;
      }

      if (REF_ATTRS.includes(name)) {
        const value = staticString(prop.initializer);
        if (value === undefined || value.trim() === '') { continue; }
        const { line, character } = sf.getLineAndCharacterOfPosition(prop.getStart(sf));
        refs.push({
          attr: name,
          ids: value.trim().split(/\s+/),
          line,
          column: character,
          snippet: node.getText(sf),
        });
      }
    }
  }
}

/** Extract a static string value, or `undefined` when dynamic/absent. */
function staticString(init: ts.JsxAttribute['initializer']): string | undefined {
  if (!init) { return ''; }
  if (ts.isStringLiteral(init)) { return init.text; }
  if (ts.isJsxExpression(init) && init.expression) {
    const expr = init.expression;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) { return expr.text; }
  }
  return undefined;
}

function validate(
  ids: IdOccurrence[],
  refs: RefOccurrence[],
  hasDynamicId: boolean,
): A11yIssue[] {
  const issues: A11yIssue[] = [];

  // ── Duplicate IDs ──
  const counts = new Map<string, IdOccurrence[]>();
  for (const occ of ids) {
    const list = counts.get(occ.id) ?? [];
    list.push(occ);
    counts.set(occ.id, list);
  }
  for (const [id, occs] of counts) {
    if (occs.length < 2) { continue; }
    // Flag every occurrence after the first.
    for (let i = 1; i < occs.length; i++) {
      issues.push({
        message: `Duplicate \`id="${id}"\` — IDs must be unique within a document. Duplicates break \`aria-labelledby\`, \`htmlFor\`, and in-page anchors (WCAG 4.1.1).`,
        rule: 'no-duplicate-id',
        severity: 'warning',
        line: occs[i].line,
        column: occs[i].column,
        snippet: occs[i].snippet,
      });
    }
  }

  // ── Broken aria references ──
  // Skip when the file has any dynamic id — the target may exist but be unresolvable.
  if (!hasDynamicId) {
    const known = new Set(ids.map(o => o.id));
    for (const ref of refs) {
      const missing = ref.ids.filter(id => !known.has(id));
      if (missing.length === 0) { continue; }
      issues.push({
        message: `\`${ref.attr}\` references ${missing.map(m => `\`${m}\``).join(', ')}, but no element with that \`id\` exists in this file. Screen readers will find no accessible name (WCAG 1.3.1).`,
        rule: 'aria-valid-ref',
        severity: 'warning',
        line: ref.line,
        column: ref.column,
        snippet: ref.snippet,
      });
    }
  }

  return issues;
}
