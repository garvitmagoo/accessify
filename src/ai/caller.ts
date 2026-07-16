/**
 * Shared AI API caller functions used by both the single-fix provider
 * and the full-file fix pipeline.
 */

import * as vscode from 'vscode';

export const AI_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1_000;

/* ── Diagnostic logging ───────────────────────────────────────────────── */

type AiLogger = (msg: string) => void;
let _aiLog: AiLogger = () => {};

/** Wire a logger (e.g. the Accessify output channel) for AI network diagnostics. */
export function setAiLogger(fn: AiLogger): void {
  _aiLog = fn;
}

function aiLog(msg: string): void {
  const line = `[ai-caller] ${msg}`;
  try { _aiLog(line); } catch { /* ignore */ }
}

/** Returns true for status codes that are safe to retry. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Parse Retry-After header into milliseconds, with a sane cap. */
function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) { return null; }
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, 60_000);
  }
  return null;
}

/** Sleep for the given duration. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an HTTP fetch with exponential back-off and rate-limit handling.
 * Retries on 429 / 5xx; throws immediately for non-retryable errors.
 */
async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  let lastError: Error | undefined;
  const bodyBytes = typeof init.body === 'string' ? init.body.length : 0;
  aiLog(`POST ${url} (request body ${bodyBytes} bytes, timeout ${timeoutMs}ms)`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (externalSignal?.aborted) {
      throw new Error('AI request was cancelled.');
    }
    const controller = new AbortController();
    // The timeout/abort must cover BOTH the connection phase AND reading the
    // response body. Slow-streaming models hang in the body-read phase, so the
    // controller (and therefore cancellation) must stay active until the full
    // body has been read.
    const timeoutId = setTimeout(() => {
      aiLog(`attempt ${attempt + 1}: TIMEOUT after ${timeoutMs}ms — aborting`);
      controller.abort();
    }, timeoutMs);
    const onExternalAbort = () => {
      aiLog(`attempt ${attempt + 1}: external cancel — aborting`);
      controller.abort();
    };
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    const started = Date.now();
    try {
      aiLog(`attempt ${attempt + 1}: sending request…`);
      const response = await fetch(url, { ...init, signal: controller.signal });
      aiLog(`attempt ${attempt + 1}: headers received (status ${response.status}) after ${Date.now() - started}ms`);

      if (!response.ok) {
        if (isRetryable(response.status) && attempt < MAX_RETRIES) {
          const retryAfter = parseRetryAfter(response);
          const backoff = retryAfter ?? INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          aiLog(`attempt ${attempt + 1}: retryable status ${response.status}, backing off ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
        // Drain the error body (best-effort) so the socket can close.
        const errText = await response.text().catch(() => '');
        throw new Error(`API error: ${response.status} ${response.statusText}${errText ? ` — ${errText.slice(0, 300)}` : ''}`);
      }

      // Read the body under the SAME controller so timeout/cancel abort the
      // socket read itself, not just an outer wrapper promise.
      aiLog(`attempt ${attempt + 1}: reading response body…`);
      const text = await response.text();
      aiLog(`attempt ${attempt + 1}: body read (${text.length} chars) after ${Date.now() - started}ms total`);
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Failed to parse AI response as JSON (${text.length} chars)`);
      }
    } catch (e: unknown) {
      if (externalSignal?.aborted) {
        aiLog(`attempt ${attempt + 1}: cancelled by user after ${Date.now() - started}ms`);
        throw new Error('AI request was cancelled.');
      }
      if (e instanceof DOMException && e.name === 'AbortError') {
        aiLog(`attempt ${attempt + 1}: aborted (timeout) after ${Date.now() - started}ms`);
        throw new Error(
          'AI request timed out. The model may be too slow or the file too large — try a faster model (e.g. gpt-4o-mini) or a smaller file.',
        );
      }
      // Retry only transient network errors (not API/parse errors).
      const isApiOrParse = e instanceof Error && (e.message.startsWith('API error:') || e.message.startsWith('Failed to parse'));
      if (attempt < MAX_RETRIES && !isApiOrParse) {
        lastError = e instanceof Error ? e : new Error(String(e));
        aiLog(`attempt ${attempt + 1}: network error "${lastError.message}" after ${Date.now() - started}ms, retrying`);
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      aiLog(`attempt ${attempt + 1}: failing with "${e instanceof Error ? e.message : String(e)}"`);
      throw e;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  throw lastError ?? new Error('AI request failed after retries');
}

/* ── AI Provider Response Types ───────────────────────────────────────── */

interface OpenAIResponse {
  error?: { message: string; type?: string; code?: string };
  choices: Array<{ message: { content: string }; finish_reason: string }>;
}

interface ClaudeResponse {
  error?: { message: string; type?: string };
  content: Array<{ type: string; text: string }>;
}

/* ── Call Options ─────────────────────────────────────────────────────── */

export interface AiCallOptions {
  systemPrompt: string;
  userMessage: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AzureCallOptions extends AiCallOptions {
  endpoint: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  'azure-openai': 'gpt-4o',
  claude: 'claude-sonnet-4-20250514',
  copilot: '',
};

/**
 * Return a sensible model name when the user hasn't explicitly set one
 * (or left it at the old default that doesn't match their provider).
 */
export function resolveModelDefault(model: string, provider: string): string {
  if (model) { return model; }
  return DEFAULT_MODELS[provider] ?? 'gpt-4';
}

/**
 * Call the OpenAI chat completions API.
 */
export async function callOpenAI(opts: AiCallOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 2048;

  const data = await fetchJsonWithRetry<OpenAIResponse>(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    },
    AI_TIMEOUT_MS,
    opts.signal,
  );

  if (data.error) {
    aiLog(`callOpenAI: API returned error: ${data.error.message ?? 'unknown'}`);
    throw new Error(`OpenAI API error: ${data.error.message ?? 'unknown'}`);
  }
  aiLog(`callOpenAI: response has ${data.choices?.length ?? 0} choice(s), finish_reason="${data.choices?.[0]?.finish_reason}"`);
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    aiLog(`callOpenAI: content is ${typeof content}, not string — rejecting`);
    throw new Error('Unexpected AI response format: no content returned');
  }
  aiLog(`callOpenAI: returning content (${content.length} chars)`);
  return content;
}

/**
 * Call the Azure OpenAI chat completions API.
 */
export async function callAzureOpenAI(opts: AzureCallOptions): Promise<string> {
  if (!opts.endpoint) {
    throw new Error('Azure OpenAI endpoint not configured');
  }
  if (!opts.endpoint.startsWith('https://')) {
    throw new Error('Azure OpenAI endpoint must use HTTPS');
  }

  const url = `${opts.endpoint}/openai/deployments/${opts.model}/chat/completions?api-version=2024-02-01`;
  const maxTokens = opts.maxTokens ?? 2048;

  const data = await fetchJsonWithRetry<OpenAIResponse>(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': opts.apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    },
    AI_TIMEOUT_MS,
    opts.signal,
  );

  if (data.error) {
    throw new Error(`Azure OpenAI API error: ${data.error.message ?? 'unknown'}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected AI response format: no content returned');
  }
  return content;
}

/**
 * Call the Anthropic Claude messages API.
 */
export async function callClaude(opts: AiCallOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 2048;

  const data = await fetchJsonWithRetry<ClaudeResponse>(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: maxTokens,
        system: opts.systemPrompt,
        messages: [
          { role: 'user', content: opts.userMessage },
        ],
        temperature: 0.1,
      }),
    },
    AI_TIMEOUT_MS,
    opts.signal,
  );

  if (data.error) {
    throw new Error(`Claude API error: ${data.error.message}`);
  }
  const content = data.content?.[0]?.text;
  if (typeof content !== 'string') {
    throw new Error('Unexpected Claude response format: no content returned');
  }
  return content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

/**
 * Call the VS Code Language Model API (GitHub Copilot).
 * No API key needed — uses the user's existing Copilot subscription.
 */
export async function callCopilot(opts: Omit<AiCallOptions, 'apiKey'>): Promise<string> {
  if (typeof vscode.lm?.selectChatModels !== 'function') {
    throw new Error(
      'VS Code Language Model API is not available. Ensure you are running VS Code 1.93+ with GitHub Copilot installed and signed in.',
    );
  }

  const selector: vscode.LanguageModelChatSelector = {};
  if (opts.model) {
    // Allow user to specify a family like 'gpt-4o' or 'claude-sonnet'
    selector.family = opts.model;
  }

  const models = await vscode.lm.selectChatModels(selector);
  if (!models || models.length === 0) {
    throw new Error(
      opts.model
        ? `No Copilot model found matching "${opts.model}". Ensure GitHub Copilot is installed, you are signed in, and the model family is available.`
        : 'No Copilot models available. Ensure GitHub Copilot is installed and you are signed in.',
    );
  }

  const model = models[0];
  aiLog(`callCopilot: using model "${model.name}" (family: ${model.family}, vendor: ${model.vendor})`);

  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(`${opts.systemPrompt}\n\n${opts.userMessage}`),
  ];

  const requestOptions: vscode.LanguageModelChatRequestOptions = {
    justification: 'Accessify accessibility fix',
  };

  let cancellationToken: vscode.CancellationToken | undefined;
  if (opts.signal) {
    const cts = new vscode.CancellationTokenSource();
    opts.signal.addEventListener('abort', () => cts.cancel(), { once: true });
    cancellationToken = cts.token;
  }

  const response = await model.sendRequest(
    messages,
    requestOptions,
    cancellationToken,
  );

  // Collect the streamed response
  let result = '';
  for await (const chunk of response.text) {
    result += chunk;
  }

  aiLog(`callCopilot: response collected (${result.length} chars)`);

  // Strip markdown fences if the model wrapped the JSON
  return result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

/**
 * Route an AI call to the correct provider.
 */
export async function callAiProvider(
  provider: string,
  opts: AiCallOptions & { endpoint?: string },
): Promise<string> {
  aiLog(`callAiProvider: provider=${provider}`);
  let result: string;
  try {
    if (provider === 'copilot') {
      result = await callCopilot(opts);
    } else if (provider === 'azure-openai') {
      result = await callAzureOpenAI({ ...opts, endpoint: opts.endpoint ?? '' });
    } else if (provider === 'claude') {
      result = await callClaude(opts);
    } else {
      result = await callOpenAI(opts);
    }
  } catch (e) {
    aiLog(`callAiProvider: CAUGHT error: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  aiLog(`callAiProvider: returning ${result.length} chars`);
  return result;
}
