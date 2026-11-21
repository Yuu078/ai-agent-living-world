import { ClipboardList, Hammer, Lock, Users } from 'lucide-react';
import type { AgentState } from '@living-world/shared';
import { useWorldStore } from '../store/useWorldStore';
import { useDataStore } from '../store/useDataStore';
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

const UPCOMING_FEATURES: readonly string[] = ['Logs — Phase 2'];

export default function Sidebar() {
  const setActivePanel = useDataStore((s) => s.setActivePanel);
  const agentViews = useWorldStore((s) => s.agentViews);
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const setFollowAgent = useWorldStore((s) => s.setFollowAgent);
  const cameraPreset = useWorldStore((s) => s.cameraPreset);
  const setCameraPreset = useWorldStore((s) => s.setCameraPreset);
  const cutaway = useWorldStore((s) => s.cutaway);
  const setCutaway = useWorldStore((s) => s.setCutaway);
  const activeFloor = useWorldStore((s) => s.activeFloor);
  const setActiveFloor = useWorldStore((s) => s.setActiveFloor);
  const setBuildMode = useWorldStore((s) => s.setBuildMode);

  const handleAgentClick = (id: string) => {
    selectAgent(id);
    if (cameraPreset === 'follow') {
      setFollowAgent(id);
    }
  };

  return (
    <div className="glass w-60 rounded-2xl p-3">
      <div className="flex flex-col gap-4">
        {/* Agents */}
        <div>
          <div className="mb-2 text-[11px] font-semibold tracking-widest opacity-70">
            AGENTS
          </div>
          <div className="flex flex-col gap-1">
            {AGENT_PROFILES.map((profile) => {
              const state: AgentState =
                agentViews[profile.id]?.state ?? 'idle';
              const isSelected = selectedAgentId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleAgentClick(profile.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/10 ${
                    isSelected ? 'bg-white/10' : ''
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: profile.color }}
                  />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium">
                      {profile.name}
                    </span>
                    <span className="block truncate text-[11px] opacity-70">
                      {profile.role}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {agentViews[profile.id]?.floor === 2 && (
                      <span className="rounded bg-sky-500/30 px-1 text-[10px] font-semibold">
                        F2
                      </span>
                    )}
                    <span className="text-[11px] opacity-80">
                      {stateLabel[state]}
                    </span>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: stateColor[state] }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* World controls */}
        <div>
          <div className="mb-2 text-[11px] font-semibold tracking-widest opacity-70">
            WORLD
          </div>
          <div className="flex flex-col gap-1">
            {/* Floor switcher (Phase 4) */}
            <div className="mb-1 flex gap-1">
              {([1, 2] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFloor(f)}
                  className={`glass-button flex-1 rounded-lg px-3 py-1.5 text-sm ${
                    activeFloor === f ? 'active' : ''
                  }`}
                >
                  Floor {f}
                  <span className="block text-[10px] opacity-70">
                    {f === 1 ? 'Office' : 'Exec & Lab'}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCameraPreset('isometric')}
              className="glass-button w-full rounded-lg px-3 py-1.5 text-left text-sm"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setCameraPreset('top')}
              className="glass-button w-full rounded-lg px-3 py-1.5 text-left text-sm"
            >
              Top view
            </button>
            <button
              type="button"
              onClick={() => setCutaway(!cutaway)}
              className={`glass-button w-full rounded-lg px-3 py-1.5 text-left text-sm ${
                cutaway ? 'active' : ''
              }`}
            >
              Cutaway walls/roof
              <span className="float-right text-xs opacity-80">
                {cutaway ? 'On' : 'Off'}
              </span>
            </button>
          </div>
        </div>

        {/* Workspace — Phase 3 live features */}
        <div>
          <div className="mb-2 text-[11px] font-semibold tracking-widest opacity-70">
            WORKSPACE
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setActivePanel('tasks')}
              className="glass-button flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm"
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              Tasks — Live Orchestrator
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('meetings')}
              className="glass-button flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm"
            >
              <Users className="h-4 w-4 shrink-0" />
              Meetings — Live Discussion
            </button>
            <button
              type="button"
              onClick={() => {
                setBuildMode(true);
                setActivePanel('build');
              }}
              className="glass-button flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm"
            >
              <Hammer className="h-4 w-4 shrink-0" />
              Build Mode — Place Furniture
            </button>
          </div>
        </div>

        {/* Upcoming features — honestly labeled, non-interactive */}
        <div>
          <div className="mb-2 text-[11px] font-semibold tracking-widest opacity-70">
            COMING LATER
          </div>
          <div className="flex flex-col gap-1 opacity-60">
            {UPCOMING_FEATURES.map((label) => (
              <div
                key={label}
                className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
              >
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
