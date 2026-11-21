/**
 * Server API client (Phase 3) — thin fetch wrapper over the Living
 * World server. All LLM work happens server-side; this module only
 * moves JSON. When the server is offline the calls reject and the UI
 * keeps showing its last known data (DEMO_MODE stays honest).
 */
import type {
  ArtifactPayload,
  ChatMessagePayload,
  MeetingPayload,
  TaskPayload,
  WorldStats,
} from '@living-world/shared';

export const SERVER_URL: string =
  (import.meta as any).env?.VITE_SERVER_URL ?? 'http://localhost:4000';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* keep the status-based message */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const api = {
  listTasks: () => req<TaskPayload[]>('/api/tasks'),
  runGoal: (prompt: string, requiresApproval: boolean) =>
    post<TaskPayload>('/api/run', { prompt, requiresApproval }),
  approveTask: (id: string) => post<TaskPayload>(`/api/tasks/${id}/approve`),
  rejectTask: (id: string) => post<TaskPayload>(`/api/tasks/${id}/reject`),
  cancelTask: (id: string) => post<TaskPayload>(`/api/tasks/${id}/cancel`),
  retryTask: (id: string) => post<TaskPayload>(`/api/tasks/${id}/retry`),
  listArtifacts: () => req<ArtifactPayload[]>('/api/artifacts'),
  chat: (agentId: string, message: string) =>
    post<{ agentId: string; reply: string; model: string }>('/api/chat', {
      agentId,
      message,
    }),
  chatHistory: (agentId: string) =>
    req<{ agentId: string; messages: ChatMessagePayload[] }>(
      `/api/chat/${agentId}`,
    ),
  listMeetings: () => req<MeetingPayload[]>('/api/meetings'),
  startMeeting: (topic: string, participantIds: string[]) =>
    post<MeetingPayload>('/api/meetings', { topic, participantIds }),
  stats: () => req<WorldStats>('/api/stats'),
};

/** Trigger a browser download of an artifact's text content. */
export function downloadArtifact(artifact: ArtifactPayload): void {
  const blob = new Blob([artifact.contentText], {
    type: artifact.mimeType || 'text/plain',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = artifact.filename;
  a.click();
  URL.revokeObjectURL(url);
}
