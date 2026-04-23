/**
 * Shared AI API caller functions used by both the single-fix provider
 * and the full-file fix pipeline.
 */

export const AI_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1_000;

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
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (response.ok) { return response; }

      if (isRetryable(response.status) && attempt < MAX_RETRIES) {
        const retryAfter = parseRetryAfter(response);
        const backoff = retryAfter ?? INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
        continue;
      }

      // Non-retryable error or exhausted retries
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new Error(
          'AI request timed out. The file may be too large — try reducing its size or increasing the timeout.',
        );
      }
      if (attempt < MAX_RETRIES && !(e instanceof Error && e.message.startsWith('API error:'))) {
        lastError = e instanceof Error ? e : new Error(String(e));
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error('AI request failed after retries');
}

export interface AiCallOptions {
  systemPrompt: string;
  userMessage: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
}

export interface AzureCallOptions extends AiCallOptions {
  endpoint: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4',
  'azure-openai': 'gpt-4',
  claude: 'claude-sonnet-4-20250514',
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

  const response = await fetchWithRetry(
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
  );

  const data = await response.json() as any;
  if (data?.error) {
    throw new Error(`OpenAI API error: ${data.error.message ?? 'unknown'}`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected AI response format: no content returned');
  }
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

  const response = await fetchWithRetry(
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
  );

  const data = await response.json() as any;
  if (data?.error) {
    throw new Error(`Azure OpenAI API error: ${data.error.message ?? 'unknown'}`);
  }
  const content = data?.choices?.[0]?.message?.content;
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

  const response = await fetchWithRetry(
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
  );

  const data = await response.json() as any;
  if (data?.error) {
    throw new Error(`Claude API error: ${data.error.message}`);
  }
  const content = data?.content?.[0]?.text;
  if (typeof content !== 'string') {
    throw new Error('Unexpected Claude response format: no content returned');
  }
  return content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
}

/**
 * Route an AI call to the correct provider.
 */
export async function callAiProvider(
  provider: string,
  opts: AiCallOptions & { endpoint?: string },
): Promise<string> {
  if (provider === 'azure-openai') {
    return callAzureOpenAI({ ...opts, endpoint: opts.endpoint ?? '' });
  } else if (provider === 'claude') {
    return callClaude(opts);
  }
  return callOpenAI(opts);
}
