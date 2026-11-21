/**
 * Sandboxed agent tools (Phase 3, Spec Section 3).
 *
 * Deliberately small and safe:
 * - `writeArtifact` persists text output to the `artifacts` table —
 *   the only "file system" an agent can touch.
 * - `webFetch` fetches one http(s) URL with a hard timeout and a size
 *   cap; no local file access, no request bodies, no credentials.
 * - `runSummary` deterministically condenses text (first lines) so the
 *   orchestrator can pass prior results as context WITHOUT spending
 *   LLM tokens on summarisation.
 */
import { randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import { artifacts } from '../db/schema.js';
import { stripThinkTags } from './llmAdapter.js';

export interface ArtifactInput {
  taskId?: string | null;
  agentId?: string | null;
  filename: string;
  mimeType?: string;
  contentText: string;
}

export interface ArtifactRecord {
  id: string;
  taskId: string | null;
  agentId: string | null;
  filename: string;
  mimeType: string;
  contentText: string;
  createdAt: number;
}

/** Persist a text artifact; returns the stored record. */
export function writeArtifact(input: ArtifactInput): ArtifactRecord {
  const record: ArtifactRecord = {
    id: `artifact_${randomBytes(5).toString('hex')}`,
    taskId: input.taskId ?? null,
    agentId: input.agentId ?? null,
    filename: input.filename,
    mimeType: input.mimeType ?? 'text/markdown',
    contentText: stripThinkTags(input.contentText),
    createdAt: Date.now(),
  };
  db.insert(artifacts)
    .values({
      id: record.id,
      taskId: record.taskId,
      agentId: record.agentId,
      filename: record.filename,
      mimeType: record.mimeType,
      contentText: record.contentText,
      createdAt: record.createdAt,
    })
    .run();
  return record;
}

const WEB_FETCH_TIMEOUT_MS = 10_000;
const WEB_FETCH_MAX_CHARS = 8_000;

/**
 * Fetch a public http(s) page as text. Throws on non-2xx, timeout, or
 * a non-http(s) URL. HTML is returned raw (callers/LLM cope with it);
 * the response is truncated to keep prompts bounded.
 */
export async function webFetch(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`web_fetch only supports http(s) URLs, got: ${parsed.protocol}`);
  }
  const res = await fetch(parsed, {
    signal: AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'living-world-agent/1.0' },
  });
  if (!res.ok) {
    throw new Error(`web_fetch failed: HTTP ${res.status} for ${url}`);
  }
  const text = await res.text();
  return text.slice(0, WEB_FETCH_MAX_CHARS);
}

/**
 * Deterministic extractive summary: the first `maxChars` of meaningful
 * lines. Used for inter-agent context passing — NOT an LLM call.
 */
export function runSummary(text: string, maxChars = 1_200): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let out = '';
  for (const line of lines) {
    if (out.length + line.length + 1 > maxChars) break;
    out += (out ? '\n' : '') + line;
  }
  return out || text.slice(0, maxChars);
}

/** Filesystem-safe slug for artifact filenames. */
export function slugify(text: string, maxLen = 48): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
  return slug || 'artifact';
}
