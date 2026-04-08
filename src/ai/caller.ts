/**
 * Shared AI API caller functions used by both the single-fix provider
 * and the full-file fix pipeline.
 */

export const AI_TIMEOUT_MS = 60_000;

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

/**
 * Call the OpenAI chat completions API.
 */
export async function callOpenAI(opts: AiCallOptions): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const maxTokens = opts.maxTokens ?? 2048;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    if (data?.error) {
      throw new Error(`OpenAI API error: HTTP ${response.status}`);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Unexpected AI response format: no content returned');
    }
    return content;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('AI request timed out. The file may be too large — try reducing its size or increasing the timeout.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const maxTokens = opts.maxTokens ?? 2048;

  try {
    const response = await fetch(url, {
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
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    if (data?.error) {
      throw new Error(`Azure OpenAI API error: HTTP ${response.status}`);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Unexpected AI response format: no content returned');
    }
    return content;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('AI request timed out. The file may be too large — try reducing its size or increasing the timeout.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call the Anthropic Claude messages API.
 */
export async function callClaude(opts: AiCallOptions): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const maxTokens = opts.maxTokens ?? 2048;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.model || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: opts.systemPrompt,
        messages: [
          { role: 'user', content: opts.userMessage },
        ],
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    if (data?.error) {
      throw new Error(`Claude API error: ${data.error.message}`);
    }
    const content = data?.content?.[0]?.text;
    if (typeof content !== 'string') {
      throw new Error('Unexpected Claude response format: no content returned');
    }
    return content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('AI request timed out. The file may be too large — try reducing its size or increasing the timeout.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
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
