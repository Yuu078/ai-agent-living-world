import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Play, RotateCcw, Send, XCircle } from 'lucide-react';
import type { TaskPayload, TaskStatus } from '@living-world/shared';
import { api } from '../engine/api';
import { AGENT_PROFILES } from '../engine/agents';
import { useDataStore } from '../store/useDataStore';
import ArtifactView from './ArtifactView';

const statusStyle: Record<TaskStatus, string> = {
  queued: 'border-sky-300/40 bg-sky-500/20',
  running: 'border-amber-300/40 bg-amber-500/20',
  waiting_approval: 'border-fuchsia-300/40 bg-fuchsia-500/25',
  completed: 'border-emerald-300/40 bg-emerald-500/20',
  failed: 'border-red-300/40 bg-red-500/20',
};

const agentName = (id: string) =>
  AGENT_PROFILES.find((p) => p.id === id)?.name ?? id;

export default function TasksPanel() {
  const setActivePanel = useDataStore((s) => s.setActivePanel);
  const tasks = useDataStore((s) => s.tasks);
  const artifacts = useDataStore((s) => s.artifacts);
  const refreshTasks = useDataStore((s) => s.refreshTasks);
  const refreshArtifacts = useDataStore((s) => s.refreshArtifacts);
  const refreshStats = useDataStore((s) => s.refreshStats);

  const [prompt, setPrompt] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);

  useEffect(() => {
    void refreshTasks();
    void refreshArtifacts();
    const timer = setInterval(() => {
      void refreshTasks();
      void refreshArtifacts();
      void refreshStats();
    }, 2500);
    return () => clearInterval(timer);
  }, [refreshTasks, refreshArtifacts, refreshStats]);

  const { goals, childrenByParent } = useMemo(() => {
    const byParent = new Map<string, TaskPayload[]>();
    const roots: TaskPayload[] = [];
    for (const t of tasks) {
      if (t.parentTaskId) {
        const list = byParent.get(t.parentTaskId) ?? [];
        list.push(t);
        byParent.set(t.parentTaskId, list);
      } else {
        roots.push(t);
      }
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }
    roots.sort((a, b) => b.createdAt - a.createdAt);
    return { goals: roots, childrenByParent: byParent };
  }, [tasks]);

  const artifactById = useMemo(() => {
    const map = new Map(artifacts.map((a) => [a.id, a]));
    return map;
  }, [artifacts]);

  const submit = async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api.runGoal(prompt.trim(), needsApproval);
      setPrompt('');
      setNeedsApproval(false);
      await refreshTasks();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* the next poll shows the true state; errors surface in errorLog */
    }
    await refreshTasks();
  };

  const renderTask = (task: TaskPayload, depth: number) => {
    const artifact = task.resultArtifactId
      ? artifactById.get(task.resultArtifactId)
      : undefined;
    const isOpen = openArtifactId !== null && openArtifactId === task.resultArtifactId;
    return (
      <div
        key={task.id}
        className="rounded-xl border border-white/10 bg-white/5 p-2"
        style={{ marginLeft: depth * 14 }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium" title={task.title}>
              {task.title}
            </div>
            <div className="text-[11px] opacity-70">
              {agentName(task.assignedAgentId)} ·{' '}
              {new Date(task.createdAt).toLocaleTimeString()}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle[task.status]}`}
          >
            {task.status}
          </span>
        </div>

        {task.status === 'failed' && task.errorLog ? (
          <p className="mt-1 break-words text-[11px] leading-snug text-red-200/90">
            {task.errorLog}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.status === 'waiting_approval' ? (
            <>
              <button
                type="button"
                onClick={() => void act(() => api.approveTask(task.id))}
                className="glass-button rounded-md px-2 py-0.5 text-[11px]"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => void act(() => api.rejectTask(task.id))}
                className="glass-button rounded-md px-2 py-0.5 text-[11px]"
              >
                Reject
              </button>
            </>
          ) : null}
          {task.status === 'failed' ? (
            <button
              type="button"
              onClick={() => void act(() => api.retryTask(task.id))}
              className="glass-button flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
            >
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
          ) : null}
          {task.status === 'queued' ||
          task.status === 'running' ||
          task.status === 'waiting_approval' ? (
            <button
              type="button"
              onClick={() => void act(() => api.cancelTask(task.id))}
              className="glass-button flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
            >
              <XCircle className="h-3 w-3" /> Cancel
            </button>
          ) : null}
          {artifact ? (
            <button
              type="button"
              onClick={() => setOpenArtifactId(isOpen ? null : artifact.id)}
              className="glass-button flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
            >
              <FileText className="h-3 w-3" />
              {isOpen ? 'Hide artifact' : 'View artifact'}
            </button>
          ) : null}
        </div>

        {artifact && isOpen ? (
          <div className="mt-2">
            <ArtifactView artifact={artifact} />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="glass flex max-h-[calc(100vh-6rem)] w-80 flex-col rounded-2xl p-3">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActivePanel('world')}
          className="glass-button flex h-7 w-7 items-center justify-center rounded-full"
          aria-label="Back to world panel"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold">Tasks — Live Orchestrator</div>
      </div>

      {/* Goal form */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Give the office a goal — Nova will break it into subtasks for the team…"
          className="w-full resize-none rounded-lg bg-black/30 p-2 text-[13px] outline-none placeholder:opacity-50"
        />
        <label className="mt-1 flex cursor-pointer items-center gap-2 text-[12px] opacity-90">
          <input
            type="checkbox"
            checked={needsApproval}
            onChange={(e) => setNeedsApproval(e.target.checked)}
          />
          Requires my approval before starting
        </label>
        {formError ? (
          <p className="mt-1 text-[11px] leading-snug text-red-200">{formError}</p>
        ) : null}
        <button
          type="button"
          disabled={!prompt.trim() || submitting}
          onClick={() => void submit()}
          className="glass-button mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {submitting ? <Play className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
          {submitting ? 'Submitting…' : 'Run goal'}
        </button>
      </div>

      {/* Task tree */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {goals.length === 0 ? (
          <p className="text-[12px] leading-relaxed opacity-70">
            No tasks yet. Submit a goal above — or the list is empty because
            the server is offline (DEMO_MODE).
          </p>
        ) : (
          goals.map((goal) => (
            <div key={goal.id} className="flex flex-col gap-1.5">
              {renderTask(goal, 0)}
              {(childrenByParent.get(goal.id) ?? []).map((child) =>
                renderTask(child, 1),
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
