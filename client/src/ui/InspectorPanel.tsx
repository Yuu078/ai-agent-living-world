import { useEffect, useState } from 'react';
import { FileText, MessageSquare, Send, X } from 'lucide-react';
import type { AgentState, TargetZone } from '@living-world/shared';
import { useWorldStore } from '../store/useWorldStore';
import { useDataStore } from '../store/useDataStore';
import { api } from '../engine/api';
import { AGENT_PROFILES } from '../engine/agents';
import ArtifactView from './ArtifactView';

const stateLabel: Record<AgentState, string> = {
  idle: 'Idle',
  walking: 'Walking',
  sitting: 'Sitting',
  thinking: 'Thinking',
  typing: 'Typing',
  tool_calling: 'Tool calling',
  meeting: 'In meeting',
  celebrating: 'Celebrating',
  error: 'Error',
  coffee_break: 'Coffee break',
};

const zoneLabel: Record<TargetZone, string> = {
  desk: 'Desk',
  meeting_room: 'Meeting Room',
  coffee_bar: 'Coffee Bar',
  lounge: 'Lounge',
  reception: 'Reception',
  garden: 'Garden',
};

const stateColor: Record<AgentState, string> = {
  typing: '#22c55e',
  thinking: '#a78bfa',
  walking: '#38bdf8',
  coffee_break: '#fb923c',
  meeting: '#facc15',
  error: '#ef4444',
  tool_calling: '#4ade80',
  idle: '#9ca3af',
  sitting: '#9ca3af',
  celebrating: '#9ca3af',
};

export default function InspectorPanel() {
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const agentViews = useWorldStore((s) => s.agentViews);
  const followAgentId = useWorldStore((s) => s.followAgentId);
  const setFollowAgent = useWorldStore((s) => s.setFollowAgent);
  const cameraPreset = useWorldStore((s) => s.cameraPreset);
  const setCameraPreset = useWorldStore((s) => s.setCameraPreset);

  const artifacts = useDataStore((s) => s.artifacts);
  const stats = useDataStore((s) => s.stats);
  const chatByAgent = useDataStore((s) => s.chatByAgent);
  const loadChat = useDataStore((s) => s.loadChat);
  const setChat = useDataStore((s) => s.setChat);
  const refreshArtifacts = useDataStore((s) => s.refreshArtifacts);
  const refreshStats = useDataStore((s) => s.refreshStats);

  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAgentId) return;
    setChatError(null);
    setOpenArtifactId(null);
    void loadChat(selectedAgentId);
    void refreshArtifacts();
    void refreshStats();
  }, [selectedAgentId, loadChat, refreshArtifacts, refreshStats]);

  const profile = selectedAgentId
    ? AGENT_PROFILES.find((p) => p.id === selectedAgentId)
    : undefined;

  if (!selectedAgentId || !profile) {
    const counts = new Map<AgentState, number>();
    for (const view of Object.values(agentViews)) {
      counts.set(view.state, (counts.get(view.state) ?? 0) + 1);
    }
    const entries = Array.from(counts.entries()).filter(
      ([, count]) => count > 0,
    );

    return (
      <div className="glass w-72 rounded-2xl p-4">
        <div className="font-semibold">Inspector</div>
        <p className="mt-2 text-sm leading-relaxed opacity-80">
          Click an agent in the world (or in the sidebar) to inspect its live
          state.
        </p>
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold tracking-widest opacity-70">
            WORLD SUMMARY
          </div>
          {entries.length === 0 ? (
            <p className="text-sm opacity-70">No agent data yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {entries.map(([state, count]) => (
                <li
                  key={state}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: stateColor[state] }}
                  />
                  <span className="flex-1">{stateLabel[state]}</span>
                  <span className="font-mono text-xs opacity-80">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const view = agentViews[profile.id];
  const state: AgentState = view?.state ?? 'idle';
  const zone: TargetZone = view?.zone ?? 'desk';
  const thoughtBubble = view?.thoughtBubble;
  const isFollowing =
    followAgentId === profile.id && cameraPreset === 'follow';
  const agentTokens =
    stats?.perAgent.find((p) => p.agentId === profile.id)?.totalTokens ?? 0;
  const agentArtifacts = artifacts
    .filter((a) => a.agentId === profile.id)
    .slice()
    .reverse();
  const chatMessages = chatByAgent[profile.id] ?? [];

  const sendChat = async () => {
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatBusy(true);
    setChatError(null);
    const optimistic = [
      ...chatMessages,
      { role: 'user' as const, content: message, timestamp: Date.now() },
    ];
    setChat(profile.id, optimistic);
    setChatInput('');
    try {
      const res = await api.chat(profile.id, message);
      setChat(profile.id, [
        ...optimistic,
        { role: 'assistant' as const, content: res.reply, timestamp: Date.now() },
      ]);
      void refreshStats();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div className="glass max-h-[calc(100vh-6rem)] w-72 overflow-y-auto rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-black/70"
          style={{ backgroundColor: profile.color }}
        >
          {profile.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-lg font-semibold">{profile.name}</div>
          <div className="truncate text-xs opacity-70">
            {profile.role} · {profile.department}
          </div>
        </div>
        <button
          type="button"
          onClick={() => selectAgent(null)}
          className="glass-button flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Details */}
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 opacity-70">Status</span>
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: stateColor[state] }}
          />
          <span>{stateLabel[state]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 opacity-70">Zone</span>
          <span>{zoneLabel[zone]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 opacity-70">Desk</span>
          <span>Desk #{profile.deskIndex + 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 opacity-70">Model</span>
          <span className="font-mono text-xs">{profile.model}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 opacity-70">Tokens</span>
          <span className="font-mono text-xs">
            {agentTokens.toLocaleString()} used (server total)
          </span>
        </div>
      </div>

      {/* Thought bubble */}
      {thoughtBubble ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest opacity-70">
            <MessageSquare className="h-3.5 w-3.5" />
            THOUGHT
          </div>
          <p className="text-sm italic leading-relaxed">
            &ldquo;{thoughtBubble}&rdquo;
          </p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-4">
        {isFollowing ? (
          <button
            type="button"
            onClick={() => setCameraPreset('isometric')}
            className="glass-button w-full rounded-lg px-3 py-2 text-sm"
          >
            Stop following
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setFollowAgent(profile.id);
              setCameraPreset('follow');
            }}
            className="glass-button w-full rounded-lg px-3 py-2 text-sm"
          >
            Follow agent
          </button>
        )}
      </div>

      {/* Artifacts produced by this agent (Phase 3) */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest opacity-70">
          <FileText className="h-3.5 w-3.5" />
          ARTIFACTS ({agentArtifacts.length})
        </div>
        {agentArtifacts.length === 0 ? (
          <p className="text-[12px] opacity-70">
            Nothing yet — artifacts appear here after this agent completes
            real subtasks.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {agentArtifacts.slice(0, 6).map((artifact) => {
              const open = openArtifactId === artifact.id;
              return (
                <div key={artifact.id}>
                  <button
                    type="button"
                    onClick={() => setOpenArtifactId(open ? null : artifact.id)}
                    className="glass-button w-full truncate rounded-lg px-2 py-1 text-left font-mono text-[11px]"
                  >
                    {artifact.filename}
                  </button>
                  {open ? (
                    <div className="mt-1">
                      <ArtifactView artifact={artifact} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live chat (Phase 3) — real LLM replies, never mocked */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest opacity-70">
          <MessageSquare className="h-3.5 w-3.5" />
          LIVE CHAT
        </div>
        <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {chatMessages.length === 0 ? (
            <p className="text-[12px] opacity-70">
              Say hello — {profile.name} answers with a real LLM call.
            </p>
          ) : (
            chatMessages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg p-2 text-[12px] leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-6 bg-sky-500/20'
                    : 'mr-6 bg-white/10'
                }`}
              >
                {m.content}
              </div>
            ))
          )}
          {chatBusy ? (
            <p className="text-[12px] italic opacity-70">
              {profile.name} is thinking…
            </p>
          ) : null}
        </div>
        {chatError ? (
          <p className="mt-1 text-[11px] leading-snug text-red-200">{chatError}</p>
        ) : null}
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendChat();
            }}
            placeholder={`Message ${profile.name}…`}
            className="min-w-0 flex-1 rounded-lg bg-black/30 px-2 py-1.5 text-[13px] outline-none placeholder:opacity-50"
          />
          <button
            type="button"
            disabled={!chatInput.trim() || chatBusy}
            onClick={() => void sendChat()}
            className="glass-button flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed opacity-70">
        Chat &amp; artifacts are powered by the Phase 3 orchestrator on the
        server. When the server is offline (DEMO_MODE) they are unavailable —
        nothing here is mocked.
      </p>
    </div>
  );
}
