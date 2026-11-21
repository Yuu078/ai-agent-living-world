/**
 * LLM adapter (Phase 3) — universal OpenAI-compatible client.
 *
 * Wraps the `openai` SDK pointed at `LLM_BASE_URL` with the key from
 * `LLM_API_KEY` (server-only, Hard Rule 4). Every call returns the
 * provider-reported token usage — numbers are NEVER invented here:
 * if the provider omits usage, the counts are reported as 0 and the
 * caller can see that honestly.
 *
 * NO FAKE WORK (Hard Rule 1): when no key is configured or the API
 * call fails, this module throws `LlmError`. There is no mock path.
 */
import OpenAI from 'openai';
import { config } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  content: string;
  model: string;
  usage: TokenUsage;
}

export class LlmError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

export function isLlmConfigured(): boolean {
  return config.llm.apiKey.trim().length > 0;
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!isLlmConfigured()) {
    throw new LlmError(
      'LLM_API_KEY is not configured on the server — live LLM calls are unavailable (no mock fallback exists).',
    );
  }
  if (!client) {
    client = new OpenAI({
      baseURL: config.llm.baseUrl,
      apiKey: config.llm.apiKey,
      // The SDK default retry (2x) can triple the wait on a dead
      // provider; the orchestrator owns retry policy, so keep 1 retry.
      maxRetries: 1,
      // Force Node's global fetch (undici). The SDK's bundled
      // node-fetch shim mishandles the HTTPS_PROXY egress proxy in
      // this environment (it opens TLS against the plain-HTTP proxy
      // port -> EPROTO "wrong version number"), while undici honours
      // NODE_USE_ENV_PROXY and tunnels correctly. Verified live
      // against the Dahl endpoint on 2026-11-21.
      fetch: ((url: string | URL, init?: RequestInit) =>
        globalThis.fetch(url, init)) as never,
    });
  }
  return client;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Per-attempt timeout in milliseconds (default 60s). */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Backoff schedule for transient provider pressure (429 capacity /
 * 5xx). Dahl's free tier explicitly answers 429 with "retry after
 * Retry-After"; honouring that with spaced retries is standard
 * resilience, NOT fakery — if every attempt fails, the last error is
 * thrown and surfaces honestly in the task's error_log.
 */
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 45_000];

function retryDelayMs(err: unknown, attempt: number): number | null {
  const anyErr = err as {
    status?: number;
    headers?: Record<string, string> | Headers;
  };
  const status = anyErr.status;
  if (status !== 429 && !(typeof status === 'number' && status >= 500)) {
    return null;
  }
  const headers = anyErr.headers as
    | Record<string, string>
    | Headers
    | undefined;
  const retryAfter =
    headers && typeof (headers as Headers).get === 'function'
      ? (headers as Headers).get('retry-after')
      : (headers as Record<string, string> | undefined)?.['retry-after'];
  const fromHeader = retryAfter ? Number(retryAfter) * 1000 : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0 && fromHeader <= 60_000) {
    return fromHeader;
  }
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? null;
}

/**
 * One chat completion. Throws `LlmError` on any failure (network,
 * timeout, provider error, empty response) — callers must handle it
 * honestly (task -> failed, avatar -> error state).
 */
export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const model = opts.model ?? config.llm.defaultModel;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  let completion: OpenAI.Chat.Completions.ChatCompletion | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      completion = await getClient().chat.completions.create(
        {
          model,
          messages: opts.messages,
          max_tokens: opts.maxTokens ?? 800,
          temperature: opts.temperature ?? 0.6,
        },
        { timeout: timeoutMs },
      );
      break;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      lastError = err;
      const delay = attempt < RETRY_DELAYS_MS.length ? retryDelayMs(err, attempt) : null;
      if (delay === null) break;
      console.warn(
        `[llm] transient provider error (attempt ${attempt + 1}), retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  if (!completion) {
    const err = lastError;
    const anyErr = err as { message?: string; status?: number; code?: string };
    const timedOut =
      anyErr?.code === 'ETIMEDOUT' ||
      (typeof anyErr?.message === 'string' &&
        anyErr.message.toLowerCase().includes('timed out'));
    throw new LlmError(
      timedOut
        ? `LLM request timed out after ${timeoutMs}ms (model: ${model})`
        : `LLM request failed (model: ${model}): ${anyErr?.message ?? String(err)}`,
      anyErr?.status,
    );
  }

  const rawContent = completion.choices?.[0]?.message?.content?.trim() ?? '';
  // Some OpenAI-compatible reasoning models (e.g. MiniMax-M2.7 on
  // Dahl) inline their scratchpad in `content` as <think>…</think>.
  // That scratchpad is not the answer: strip complete think blocks,
  // and drop a trailing unclosed one (truncated mid-thought). If
  // nothing but thought remains, the response is honestly empty.
  let content = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const danglingThink = content.indexOf('<think>');
  if (danglingThink >= 0) content = content.slice(0, danglingThink).trim();
  if (!content) {
    throw new LlmError(
      `LLM returned an empty response (model: ${completion.model ?? model})`,
    );
  }
  const usage = completion.usage;
  return {
    content,
    model: completion.model ?? model,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}
