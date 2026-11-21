import { MessageSquare, X } from 'lucide-react';
import type { AgentState, TargetZone } from '@living-world/shared';
import { useWorldStore } from '../store/useWorldStore';
import { AGENT_PROFILES } from '../engine/agents';

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

  return (
    <div className="glass w-72 rounded-2xl p-4">
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

      <p className="mt-4 text-[11px] leading-relaxed opacity-70">
        Live chat, tool logs &amp; artifacts arrive in Phase 3. In DEMO_MODE
        this agent is driven by the local life simulator — no LLM calls.
      </p>
    </div>
  );
}
