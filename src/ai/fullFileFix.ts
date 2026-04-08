import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { scanForA11yIssues } from '../scanner/astScanner';
import { validateFix } from '../scanner/axeIntegration';
import { validateJsxSyntax } from '../scanner/jsxValidator';
import { loadConfig, isAiExcluded } from '../config';
import { applyActions, findOpeningTagClose } from '../jsx/utils';
import { callAiProvider } from './caller';
import type { AiFixAction } from '../types';

let _outputChannel: vscode.OutputChannel | undefined;
function getLog(): vscode.OutputChannel {
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel('Accessify');
  }
  return _outputChannel;
}

/** Show the Accessify output channel (for diagnostics). */
export function showFixLog(): void {
  getLog().show(true);
}

/* ── Full-file fix cache ─────────────────────────────────────────────── */

interface CachedFullFix {
  result: FullFileFixResult;
  timestamp: number;
}

const FULL_FIX_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FULL_FIX_CACHE_MAX = 20;
const fullFixCache = new Map<string, CachedFullFix>();

function fullFixCacheKey(sourceCode: string, issueFingerprints: string): string {
  const input = `full::${issueFingerprints}::${sourceCode}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

function getCachedFullFix(sourceCode: string, issueFingerprints: string): FullFileFixResult | null {
  const key = fullFixCacheKey(sourceCode, issueFingerprints);
  const cached = fullFixCache.get(key);
  if (!cached) { return null; }
  if (Date.now() - cached.timestamp > FULL_FIX_CACHE_TTL_MS) {
    fullFixCache.delete(key);
    return null;
  }
  return cached.result;
}

function setCachedFullFix(sourceCode: string, issueFingerprints: string, result: FullFileFixResult): void {
  const key = fullFixCacheKey(sourceCode, issueFingerprints);
  if (fullFixCache.size >= FULL_FIX_CACHE_MAX) {
    const firstKey = fullFixCache.keys().next().value;
    if (firstKey) { fullFixCache.delete(firstKey); }
  }
  fullFixCache.set(key, { result, timestamp: Date.now() });
}

/** Clear the full-file fix cache (e.g. when provider/model settings change). */
export function clearFullFixCache(): void {
  fullFixCache.clear();
}

/** A single atomic change the AI proposes. */
export interface A11yChange {
  id: number;
  /** 1-based line number where the change starts. */
  startLine: number;
  /** 1-based line number where the change ends (inclusive). */
  endLine: number;
  /** The original code snippet. */
  original: string;
  /** The proposed replacement. */
  replacement: string;
  /** Human-readable explanation of the fix. */
  explanation: string;
  /** The a11y rule that triggered this change. */
  rule: string;
  /** Confidence score 0-100 for this fix. */
  confidence: number;
  /** Reasoning for why this fix is correct. */
  reasoning?: string;
}

export interface FullFileFixResult {
  changes: A11yChange[];
  designSystemDetected: string | null;
}

/**
 * Detect the design system / component library used in the project by
 * inspecting package.json dependencies.
 */
async function detectDesignSystem(): Promise<string | null> {
  const knownSystems: Record<string, string> = {
    '@mui/material': 'Material UI (MUI)',
    '@chakra-ui/react': 'Chakra UI',
    'antd': 'Ant Design',
    '@fluentui/react': 'Fluent UI',
    '@fluentui/react-components': 'Fluent UI v9',
    'react-bootstrap': 'React Bootstrap',
    '@radix-ui/react-primitive': 'Radix UI',
    '@headlessui/react': 'Headless UI',
    'semantic-ui-react': 'Semantic UI React',
    '@mantine/core': 'Mantine',
  };

  const pkgFiles = await vscode.workspace.findFiles('package.json', '**/node_modules/**', 1);
  if (pkgFiles.length === 0) { return null; }

  try {
    const raw = await vscode.workspace.fs.readFile(pkgFiles[0]);
    const pkg = JSON.parse(Buffer.from(raw).toString('utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [key, label] of Object.entries(knownSystems)) {
      if (deps[key]) { return label; }
    }
  } catch {
  }
  return null;
}

const FULL_FILE_SYSTEM_PROMPT = `You are an accessibility expert. Fix ALL listed issues in the provided JSX/React code.

PREFERRED format — structured actions (handles formatting automatically):
{ "changes": [{
  "startLine": <1-based>, "endLine": <1-based inclusive>,
  "original": "<EXACT source text>",
  "actions": [
    { "type": "addAttribute", "name": "<attr>", "value": "<value with quotes/braces>" },
    { "type": "modifyAttribute", "name": "<attr>", "newValue": "<value>" },
    { "type": "removeAttribute", "name": "<attr>" },
    { "type": "replaceTag", "oldTag": "<tag>", "newTag": "<tag>" }
  ],
  "explanation": "<brief>", "reasoning": "<why this fix is correct, referencing WCAG>", "rule": "<rule id>"
}] }

FALLBACK format — when actions can't express the fix (restructuring, wrapping):
{ "changes": [{
  "startLine": <1-based>, "endLine": <1-based inclusive>,
  "original": "<EXACT source text>",
  "replacement": "<fixed code>",
  "explanation": "<brief>", "reasoning": "<why this fix is correct>", "rule": "<rule id>"
}] }

Rules:
- ONE change per issue. "original" must be character-for-character exact (without line number prefix).
- Target the SMALLEST range (ideally 1 line). For multiline opening tags, include ALL lines from <Tag to >.
- Use JSX attribute names: className, htmlFor, tabIndex, onClick, onKeyDown.
- When adding a role, include ALL required ARIA attrs (e.g. role="tab" needs aria-controls + aria-selected).
- Changes must NOT overlap. Do NOT change logic, imports, or non-JSX code.
- For "value" in addAttribute/modifyAttribute: use the full JSX value including quotes or braces, e.g. "\\"label\\"", "{0}", "{\`text \${i}\`}".
- Return ONLY the JSON object.`;

export interface FullFileFixOptions {
  /** Suppress per-file info/error messages (used in bulk mode). */
  silent?: boolean;
}

/**
 * Request a full-file accessibility fix from the configured AI provider.
 */
export async function getFullFileFix(document: vscode.TextDocument, options?: FullFileFixOptions): Promise<FullFileFixResult | null> {
  const silent = options?.silent ?? false;
  const config = vscode.workspace.getConfiguration('a11y');
  const provider = config.get<string>('aiProvider', 'none');

  if (provider === 'none') {
    if (!silent) { vscode.window.showWarningMessage('Accessify: AI provider is set to "none". Configure an AI provider in settings.'); }
    return null;
  }

  const a11yConfig = await loadConfig();
  if (isAiExcluded(a11yConfig, document.fileName)) {
    if (!silent) { vscode.window.showInformationMessage('Accessify: This file is excluded from AI fixes via aiExclude in .a11yrc.json.'); }
    return null;
  }

  const sourceCode = document.getText();
  const fileName = document.fileName;

  const issues = scanForA11yIssues(sourceCode, fileName);
  if (issues.length === 0) {
    if (!silent) { vscode.window.showInformationMessage('Accessify: No accessibility issues found in this file.'); }
    return null;
  }

  // Build a fingerprint of the issues for cache lookup
  const issueFingerprints = issues
    .map(i => `${i.line}:${i.rule}:${i.message}`)
    .sort()
    .join('|');

  const cached = getCachedFullFix(sourceCode, issueFingerprints);
  if (cached) {
    getLog().appendLine(`[full-file-fix] Cache hit for ${fileName}`);
    return cached;
  }

  const designSystem = await detectDesignSystem();

  const apiKey = await getApiKey(config);
  if (!apiKey) { return null; }
  const model = config.get<string>('aiModel', 'gpt-4');

  const changes = await fetchAndValidateChanges(
    sourceCode, fileName, issues, designSystem,
    apiKey, model, provider, config, silent,
  );

  if (!changes || changes.length === 0) {
    return null;
  }

  changes.forEach((c, i) => { c.id = i + 1; });

  const result: FullFileFixResult = { changes, designSystemDetected: designSystem };
  setCachedFullFix(sourceCode, issueFingerprints, result);

  return result;
}

/**
 * Call the AI, parse, and validate the response.
 */
async function fetchAndValidateChanges(
  sourceCode: string,
  _fileName: string,
  issues: ReturnType<typeof scanForA11yIssues>,
  designSystem: string | null,
  apiKey: string,
  model: string,
  provider: string,
  config: vscode.WorkspaceConfiguration,
  silent = false,
): Promise<A11yChange[] | null> {
  const issueList = issues.map((issue, idx) =>
    `${idx + 1}. [Line ${issue.line + 1}] (${issue.rule}) ${issue.message}`
  ).join('\n');

  const userMessage = buildUserMessage(sourceCode, issueList, designSystem, '', issues);

  let rawResponse: string;
  try {
    const endpoint = config.get<string>('aiEndpoint', '');
    rawResponse = await callAiProvider(provider, {
      systemPrompt: FULL_FILE_SYSTEM_PROMPT,
      userMessage,
      apiKey,
      model,
      maxTokens: 4096,
      endpoint,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (!silent) { vscode.window.showErrorMessage(`Accessify: AI request failed — ${msg}`); }
    getLog().appendLine(`[full-file-fix] AI request failed: ${msg}`);
    return null;
  }

  getLog().appendLine(`[full-file-fix] AI responded (${rawResponse.length} chars)`);

  return parseAndValidate(rawResponse, sourceCode);
}

/**
 * Parse the AI response and validate each change against the source.
 */
function parseAndValidate(rawResponse: string, sourceCode: string): A11yChange[] | null {
  const log = getLog();
  log.appendLine(''); // separator
  log.appendLine(`[full-file-fix] Parsing AI response (${rawResponse.length} chars)...`);

  try {
    const MAX_RESPONSE_SIZE = 1024 * 1024; // 1 MB
    if (rawResponse.length > MAX_RESPONSE_SIZE) {
      log.appendLine('[full-file-fix] Response too large, skipping');
      return null;
    }

    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      log.appendLine('[full-file-fix] Failed to parse AI response as JSON');
      log.appendLine(`[full-file-fix] Raw (first 500 chars): ${cleaned.substring(0, 500)}`);
      return null;
    }
    const arr: any[] = Array.isArray(parsed) ? parsed : (parsed.changes ?? parsed.fixes ?? []);

    if (!Array.isArray(arr) || arr.length === 0 || arr.length > 500) {
      log.appendLine(`[full-file-fix] Invalid changes array (length=${Array.isArray(arr) ? arr.length : 'not array'})`);
      return null;
    }

    log.appendLine(`[full-file-fix] AI returned ${arr.length} change(s)`);

    const sourceLines = sourceCode.split('\n');
    const validatedChanges: A11yChange[] = [];

    for (let idx = 0; idx < arr.length; idx++) {
      const c = arr[idx];
      const aiReasoning = typeof c.reasoning === 'string' ? c.reasoning : '';

      // Strip line-number prefixes the AI may have copied from the prompt
      let cleanOriginal = (c.original ?? '').replace(/^(\s*)\d+\|\s?/gm, '$1');

      // Locate the original text in the source.
      // If AI didn't send original (common with actions), use source text at the given lines.
      const actualLines = sourceLines.slice(c.startLine - 1, c.endLine);
      const actualText = actualLines.join('\n');
      let matchedOriginal: string;
      let matchedStart: number = c.startLine;
      let matchedEnd: number = c.endLine;

      if (!cleanOriginal) {
        // No original provided — trust the line numbers
        if (c.startLine >= 1 && c.endLine <= sourceLines.length) {
          matchedOriginal = actualText;
        } else {
          log.appendLine(`[full-file-fix] Change #${idx + 1} (${c.rule}): rejected — no original and invalid line numbers (${c.startLine}-${c.endLine})`);
          continue;
        }
      } else if (cleanOriginal.trim() === actualText.trim()) {
        matchedOriginal = actualText;
      } else {
        const found = fuzzyFindOriginal(sourceLines, cleanOriginal, c.startLine);
        if (found) {
          matchedOriginal = found.text;
          matchedStart = found.startLine;
          matchedEnd = found.endLine;
        } else {
          log.appendLine(`[full-file-fix] Change #${idx + 1} (${c.rule}): rejected — original not found in source`);
          log.appendLine(`[full-file-fix]   Expected at lines ${c.startLine}-${c.endLine}: "${actualText.substring(0, 80)}…"`);
          log.appendLine(`[full-file-fix]   AI sent original: "${cleanOriginal.substring(0, 80)}…"`);
          continue;
        }
      }

      // Build replacement: prefer structured actions, fall back to fixedCode
      let replacement: string | undefined;
      let fixMethod = 'replacement';

      const actions: AiFixAction[] | undefined = Array.isArray(c.actions) ? c.actions.filter((a: any) =>
        a && typeof a.type === 'string' &&
        ['addAttribute', 'modifyAttribute', 'removeAttribute', 'replaceTag'].includes(a.type)
      ) : undefined;

      log.appendLine(`[full-file-fix] Change #${idx + 1} (${c.rule}): has actions=${!!(actions && actions.length)}, has replacement=${!!c.replacement}, has fixedCode=${!!c.fixedCode}`);
      if (actions && actions.length > 0) {
        log.appendLine(`[full-file-fix]   Actions: ${JSON.stringify(actions)}`);
        log.appendLine(`[full-file-fix]   matchedOriginal (${matchedStart}-${matchedEnd}): "${matchedOriginal.substring(0, 120)}…"`);
      }

      // For actions, ensure we have the full opening tag (including closing > or />).
      // AI may target a single line but the tag spans multiple lines.
      if (actions && actions.length > 0) {
        let actionTarget = matchedOriginal;
        let actionEnd = matchedEnd;

        // If the matched text doesn't contain a closing > or />, expand to find it
        const hasClose = /(?:^|[^=])\s*\/?>/.test(actionTarget) || actionTarget.trim().endsWith('>');
        if (!hasClose) {
          // Expand downward to find the closing >
          for (let line = matchedEnd; line < sourceLines.length; line++) {
            actionTarget += '\n' + sourceLines[line];
            actionEnd = line + 1;
            const lineTrimmed = sourceLines[line].trim();
            if (lineTrimmed === '>' || lineTrimmed === '/>' || lineTrimmed.endsWith('>') || lineTrimmed.endsWith('/>')) {
              break;
            }
          }
          log.appendLine(`[full-file-fix]   Expanded range to ${matchedStart}-${actionEnd} to include closing >`);
        }

        const applied = applyActions(actionTarget, actions);
        if (applied && applied.trim() !== actionTarget.trim()) {
          replacement = applied;
          matchedOriginal = actionTarget;
          matchedEnd = actionEnd;
          fixMethod = 'actions';
        } else {
          log.appendLine(`[full-file-fix]   Actions applied but result ${applied === null ? 'was null' : 'was identical to original'}`);
        }
      }

      // Also check fixedCode as a replacement source
      const replSource = c.replacement || c.fixedCode;

      if (!replacement && replSource) {
        let repl: string = replSource;
        fixMethod = 'replacement';

        // Validate fixedCode-based replacements
        const origTagCount = (matchedOriginal.match(/<[A-Za-z]/g) || []).length;
        const replTagCount = (repl.match(/<[A-Za-z]/g) || []).length;
        if (replTagCount > origTagCount + 3) {
          log.appendLine(`[full-file-fix] Change #${idx + 1} (${c.rule}): rejected — too many new tags (orig=${origTagCount}, repl=${replTagCount})`);
          continue;
        }

        const origTextLen = matchedOriginal.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length;
        const replTextLen = repl.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length;
        if (origTextLen > 0 && replTextLen < origTextLen * 0.5) {
          log.appendLine(`[full-file-fix] Change #${idx + 1} (${c.rule}): rejected — too much text removed (orig=${origTextLen}, repl=${replTextLen})`);
          continue;
        }

        const replTrimmed = repl.trim();
        if (replTrimmed.startsWith('<')) {
          const syntaxCheck = validateJsxSyntax(repl);
          if (!syntaxCheck.valid) {
            log.appendLine(`[full-file-fix] Change #${idx + 1} (${c.rule}): rejected — invalid JSX: ${syntaxCheck.errors[0] ?? 'unknown'}`);
            continue;
          }
        }

        replacement = reindentReplacement(matchedOriginal, repl);
      }

      if (!replacement) {
        log.appendLine(`[full-file-fix] Change #${idx + 1} (${c.rule}): rejected — no usable replacement or actions`);
        continue;
      }

      // Validate the fix and compute confidence
      const validation = validateFix(c.rule, matchedOriginal, replacement);

      validatedChanges.push({
        id: idx + 1,
        startLine: matchedStart,
        endLine: matchedEnd,
        original: matchedOriginal,
        replacement,
        explanation: c.explanation ?? '',
        rule: c.rule ?? '',
        confidence: validation.adjustedConfidence,
        reasoning: [aiReasoning].filter(Boolean).join(' | '),
      });
      log.appendLine(`[full-file-fix] Change #${idx + 1} (${c.rule}): accepted via ${fixMethod} at lines ${matchedStart}-${matchedEnd}`);
    }

    log.appendLine(`[full-file-fix] Result: ${validatedChanges.length}/${arr.length} changes accepted`);

    return removeOverlaps(validatedChanges);
  } catch (e) {
    log.appendLine(`[full-file-fix] Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function reindentReplacement(original: string, replacement: string): string {
  const origLines = original.split('\n');
  let replLines = replacement.split('\n');

  if (replLines.length === 0) { return replacement; }

  const origFirst = origLines.find(l => l.trim().length > 0) ?? origLines[0];
  const replFirst = replLines.find(l => l.trim().length > 0) ?? replLines[0];
  const origIndent = origFirst.match(/^(\s*)/)?.[1] ?? '';
  const replIndent = replFirst.match(/^(\s*)/)?.[1] ?? '';

  if (origIndent !== replIndent) {
    const delta = origIndent.length - replIndent.length;
    const indentChar = origIndent.includes('\t') ? '\t' : ' ';

    replLines = replLines.map(line => {
      if (line.trim() === '') { return line; }
      const cur = (line.match(/^(\s*)/)?.[1] ?? '').length;
      const newLen = Math.max(0, cur + delta);
      return indentChar.repeat(newLen) + line.trimStart();
    });
  }

  // Split any new attributes the AI jammed onto an existing prop line.
  if (origLines.length > 1) {
    replLines = splitInlineAttributes(origLines, replLines);
  }

  // If original was a single complete line, collapse AI's multiline expansion back.
  // Only keep up to the opening tag's closing > to avoid including children/closing tags.
  if (origLines.length === 1 && replLines.length > 1) {
    const origTrimmed = origLines[0].trim();
    if (!/^<[A-Z][a-zA-Z0-9.]*$/.test(origTrimmed)) {
      const tagIndent = origLines[0].match(/^(\s*)/)?.[1] ?? '';
      const collapsed = replLines.map(l => l.trim()).filter(Boolean).join(' ');
      const closeIdx = findOpeningTagClose(collapsed, 0);
      if (closeIdx !== -1) {
        const endIdx = collapsed[closeIdx] === '/' ? closeIdx + 2 : closeIdx + 1;
        return tagIndent + collapsed.substring(0, endIdx);
      }
      return tagIndent + collapsed;
    }
  }

  // Single-line tag start (e.g. `<Select`) with AI-appended attributes — split them.
  if (origLines.length === 1) {
    const origTrimmed = origLines[0].trim();
    const replJoined = replLines.join('\n');
    const replTrimmed = replJoined.trim();
    // Original is a tag start that doesn't close on this line
    if (/^<[A-Z][a-zA-Z0-9.]*$/.test(origTrimmed) && replTrimmed.startsWith(origTrimmed) && replTrimmed.length > origTrimmed.length) {
      const appended = replTrimmed.slice(origTrimmed.length);
      const attrs: string[] = [];
      let m: RegExpExecArray | null;
      const attrPattern = /\s*([\w-]+=(?:"[^"]*"|'[^']*'|\{[^}]*\})|[\w-]+)/g;
      attrPattern.lastIndex = 0;
      while ((m = attrPattern.exec(appended)) !== null) {
        attrs.push(m[1]);
      }
      if (attrs.length > 0) {
        const tagIndent = origLines[0].match(/^(\s*)/)?.[1] ?? '';
        const propIndent = tagIndent + '  ';
        replLines = [origLines[0]];
        for (const attr of attrs) {
          replLines.push(propIndent + attr);
        }
      }
    }
  }

  return replLines.join('\n');
}

/**
 * Split inline-appended attributes in a multiline JSX opening tag
 * onto their own lines with correct indentation.
 */
function splitInlineAttributes(origLines: string[], replLines: string[]): string[] {
  const propLine = origLines.find((l, i) => i > 0 && l.trim().length > 0 && !l.trim().startsWith('//'));
  const propIndent = propLine?.match(/^(\s*)/)?.[1] ?? '';
  if (!propIndent) { return replLines; }

  const result: string[] = [];
  for (const line of replLines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('>') || trimmed.startsWith('/>') || trimmed.startsWith('</')) {
      result.push(line);
      continue;
    }

    // Check if the AI appended extra content to an original line
    let handled = false;
    for (const orig of origLines) {
      const ot = orig.trim();
      if (ot.length === 0) { continue; }
      if (trimmed.startsWith(ot) && trimmed.length > ot.length) {
        const appended = trimmed.slice(ot.length);
        // Parse appended attributes
        const attrs: string[] = [];
        let m: RegExpExecArray | null;
        const attrPattern = /\s*([\w-]+=(?:"[^"]*"|'[^']*'|\{[^}]*\})|[\w-]+)/g;
        attrPattern.lastIndex = 0;
        while ((m = attrPattern.exec(appended)) !== null) {
          attrs.push(m[1]);
        }
        if (attrs.length > 0) {
          result.push(orig);
          for (const attr of attrs) {
            result.push(propIndent + attr);
          }
          handled = true;
          break;
        }
      }
    }

    if (!handled) {
      result.push(line);
    }
  }

  return result;
}

/**
 * Try to find the `original` text near the expected startLine (within ±15 lines).
 * Also strips line-number prefixes from the search in case the AI copied them.
 */
function fuzzyFindOriginal(
  sourceLines: string[],
  original: string,
  expectedStart: number,
): { startLine: number; endLine: number; text: string } | null {
  const origTrimmed = original.trim();
  const origLineCount = original.split('\n').length;
  const searchRadius = 10;

  // Exact match (trim-level)
  for (let offset = 0; offset <= searchRadius; offset++) {
    for (const dir of [0, -1, 1]) {
      const start = expectedStart - 1 + (offset * (dir || 1)); // 0-based
      if (start < 0 || start + origLineCount > sourceLines.length) { continue; }
      const candidate = sourceLines.slice(start, start + origLineCount).join('\n');
      if (candidate.trim() === origTrimmed) {
        return {
          startLine: start + 1,
          endLine: start + origLineCount,
          text: candidate,
        };
      }
    }
  }

  // Whitespace-normalized match (collapse all whitespace for comparison)
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  const origNorm = normalize(original);
  for (let offset = 0; offset <= searchRadius; offset++) {
    for (const dir of [0, -1, 1]) {
      const start = expectedStart - 1 + (offset * (dir || 1));
      if (start < 0 || start + origLineCount > sourceLines.length) { continue; }
      const candidate = sourceLines.slice(start, start + origLineCount).join('\n');
      if (normalize(candidate) === origNorm) {
        return {
          startLine: start + 1,
          endLine: start + origLineCount,
          text: candidate,
        };
      }
    }
  }

  return null;
}

/**
 * Remove strictly overlapping changes — two changes conflict only if their
 * ranges actually overlap (not just touch). When they overlap, try to merge;
 * if that's not possible, keep the first.
 */
function removeOverlaps(changes: A11yChange[]): A11yChange[] {
  const sorted = [...changes].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  const result: A11yChange[] = [];

  for (const change of sorted) {
    const prev = result[result.length - 1];
    if (!prev || change.startLine > prev.endLine) {
      result.push(change);
    } else if (change.startLine === prev.startLine && change.endLine === prev.endLine) {
      result[result.length - 1] = change;
    }
  }
  return result;
}

/* ── Helpers ────────────────────────────────────────────── */

function buildUserMessage(
  sourceCode: string,
  issueList: string,
  designSystem: string | null,
  _codebaseContext: string,
  issues: { line: number }[],
): string {
  const sourceLines = sourceCode.split('\n');
  const relevantLineSet = new Set<number>();
  for (const issue of issues) {
    const start = Math.max(0, issue.line - 5);
    const end = Math.min(sourceLines.length - 1, issue.line + 5);
    for (let i = start; i <= end; i++) {
      relevantLineSet.add(i);
    }
  }

  // Build numbered source with relevant ranges
  const sortedLines = [...relevantLineSet].sort((a, b) => a - b);
  const parts: string[] = [];
  let lastLine = -2;
  for (const lineIdx of sortedLines) {
    if (lineIdx > lastLine + 1) {
      parts.push('  ...');
    }
    parts.push(`${String(lineIdx + 1).padStart(4)}| ${sourceLines[lineIdx]}`);
    lastLine = lineIdx;
  }

  let msg = `## Source Code (relevant sections with line numbers)\n\`\`\`tsx\n${parts.join('\n')}\n\`\`\`\n\n`;
  msg += `## Issues\n${issueList}\n\n`;
  msg += `Copy the "original" text character-for-character from the source (without line number prefix).\n`;
  if (designSystem) {
    msg += `\nDesign system: ${designSystem}. Use its accessible APIs.\n`;
  }
  return msg;
}

async function getApiKey(config: vscode.WorkspaceConfiguration): Promise<string | null> {
  const { getStoredApiKey } = await import('./provider');
  const key = await getStoredApiKey();
  if (key) { return key; }

  const legacyKey = config.get<string>('aiApiKey', '');
  if (legacyKey) {
    vscode.window.showWarningMessage(
      'Accessify: API key found in plaintext settings. Run "Accessify: Set AI API Key" to store it securely, then remove a11y.aiApiKey from settings.',
    );
    return legacyKey;
  }

  vscode.window.showWarningMessage('Accessify: AI API key not configured. Run "Accessify: Set AI API Key".');
  return null;
}
