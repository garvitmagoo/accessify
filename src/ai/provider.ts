import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { A11yIssue, AiFixResponse, AiFixAction } from '../types';
import { callAiProvider } from './caller';

const SYSTEM_PROMPT = `You are an accessibility expert specializing in React and WCAG 2.1 compliance.
Given a code snippet and an accessibility issue, provide a minimal, targeted fix.

PREFERRED: Return structured fix actions. Return a JSON object:
{
  "actions": [
    { "type": "addAttribute", "name": "<attr>", "value": "<value>" },
    { "type": "modifyAttribute", "name": "<attr>", "newValue": "<value>" },
    { "type": "removeAttribute", "name": "<attr>" },
    { "type": "replaceTag", "oldTag": "<tag>", "newTag": "<tag>" }
  ],
  "explanation": "<brief explanation>",
  "reasoning": "<why this fix is correct, referencing WCAG>"
}

Action types:
- addAttribute: Add a new JSX attribute. "value" is the full JSX value including quotes or braces, e.g. "\\"navigation\\"" or "{0}" or "{\`Label \${i}\`}".
- modifyAttribute: Change an existing attribute's value.
- removeAttribute: Remove an attribute.
- replaceTag: Change the element tag name (e.g. "div" → "button"). Handles both opening and closing tags.

Multiple actions can be combined (e.g. add role + tabIndex + onKeyDown).

FALLBACK: If the fix cannot be expressed as actions (e.g. restructuring, wrapping, adding siblings), return:
{
  "fixedCode": "<complete replacement code>",
  "explanation": "...",
  "reasoning": "..."
}

Rules:
- Only fix the specific accessibility issue mentioned
- Preserve existing functionality and styling
- Follow WCAG 2.1 Level AA guidelines
- Use semantic HTML where possible
- Do not add unnecessary attributes
- IMPORTANT: The code is JSX/React. Use JSX attribute names: className, htmlFor, tabIndex, onClick, onKeyDown.
- If returning fixedCode: preserve the exact indentation, line breaks, and formatting. Do NOT add children or closing tags not in the original snippet.`;

let _secrets: vscode.SecretStorage | undefined;

/**
 * Initialize the AI provider with the extension's SecretStorage.
 * Must be called once from activate().
 */
export function initAiProvider(secrets: vscode.SecretStorage): void {
  _secrets = secrets;
}

/**
 * Retrieve the stored API key from SecretStorage.
 */
export async function getStoredApiKey(): Promise<string | undefined> {
  if (!_secrets) { return undefined; }
  return _secrets.get('a11y.aiApiKey');
}

/**
 * Store the AI API key securely.
 */
export async function setAiApiKey(): Promise<void> {
  if (!_secrets) {
    vscode.window.showErrorMessage('Accessify: Secret storage not initialized.');
    return;
  }
  const key = await vscode.window.showInputBox({
    prompt: 'Enter your AI provider API key',
    password: true,
    placeHolder: 'sk-...',
    ignoreFocusOut: true,
  });
  if (key !== undefined && key.trim().length > 0) {
    await _secrets.store('a11y.aiApiKey', key.trim());
    vscode.window.showInformationMessage('Accessify: API key stored securely.');
  } else if (key !== undefined) {
    vscode.window.showWarningMessage('Accessify: API key cannot be empty.');
  }
}

/* ── AI Fix Cache ────────────────────────────────────────────────────────── */

interface CachedFix {
  response: AiFixResponse;
  timestamp: number;
}

const AI_FIX_CACHE_TTL_MS = 10 * 60 * 1000;
const AI_FIX_CACHE_MAX = 100;
const aiFixCache = new Map<string, CachedFix>();

function cacheKey(code: string, rule: string, message: string): string {
  const input = `${rule}::${message}::${code}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

function getCachedFix(code: string, rule: string, message: string): AiFixResponse | null {
  const key = cacheKey(code, rule, message);
  const cached = aiFixCache.get(key);
  if (!cached) { return null; }
  if (Date.now() - cached.timestamp > AI_FIX_CACHE_TTL_MS) {
    aiFixCache.delete(key);
    return null;
  }
  return cached.response;
}

function setCachedFix(code: string, rule: string, message: string, response: AiFixResponse): void {
  const key = cacheKey(code, rule, message);
  if (aiFixCache.size >= AI_FIX_CACHE_MAX) {
    const firstKey = aiFixCache.keys().next().value;
    if (firstKey) { aiFixCache.delete(firstKey); }
  }
  aiFixCache.set(key, { response, timestamp: Date.now() });
}

/** Clear the AI fix cache (e.g. when provider/model settings change). */
export function clearAiFixCache(): void {
  aiFixCache.clear();
}

/**
 * Get an AI-powered fix suggestion for an accessibility issue.
 */
export async function getAiFix(code: string, issue: A11yIssue, surroundingContext: string): Promise<AiFixResponse | null> {
  const config = vscode.workspace.getConfiguration('a11y');
  const provider = config.get<string>('aiProvider', 'none');

  if (provider === 'none') {
    return null;
  }

  const cached = getCachedFix(code, issue.rule, issue.message);
  if (cached) {
    return cached;
  }

  let apiKey: string | undefined;
  if (_secrets) {
    apiKey = await _secrets.get('a11y.aiApiKey');
  }
  const model = config.get<string>('aiModel', 'gpt-4');

  if (!apiKey) {
    const legacyKey = config.get<string>('aiApiKey', '');
    if (legacyKey) {
      vscode.window.showWarningMessage(
        'Accessify: API key found in plaintext settings. Run "Accessify: Set AI API Key" to store it securely, then remove a11y.aiApiKey from settings.',
      );
    } else {
      vscode.window.showWarningMessage('Accessify: AI API key not configured. Run "Accessify: Set AI API Key" to set it up.');
    }
    return null;
  }

  const userMessage = `Accessibility Issue: ${issue.message}
Rule: ${issue.rule}
Severity: ${issue.severity}

Code snippet to fix:
\`\`\`tsx
${code}
\`\`\`

Surrounding context (for reference only):
\`\`\`tsx
${surroundingContext}
\`\`\`

Return JSON with "actions" array (preferred) or "fixedCode" string.`;

  try {
    const endpoint = config.get<string>('aiEndpoint', '');
    const response = await callAiProvider(provider, {
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      apiKey,
      model,
      endpoint,
    });

    let cleaned = response.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    const parsed = JSON.parse(cleaned);

    // Parse structured actions if present
    let actions: AiFixAction[] | undefined;
    if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
      actions = parsed.actions.filter((a: any) =>
        a && typeof a.type === 'string' &&
        ['addAttribute', 'modifyAttribute', 'removeAttribute', 'replaceTag'].includes(a.type)
      );
      if (actions!.length === 0) { actions = undefined; }
    }

    const result: AiFixResponse = {
      fixedCode: parsed.fixedCode ?? '',
      explanation: parsed.explanation ?? '',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      actions,
    };
    setCachedFix(code, issue.rule, issue.message, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Accessify: AI fix failed - ${message}`);
    return null;
  }
}
