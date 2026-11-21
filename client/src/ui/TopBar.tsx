import { Bot, Clock, Coins, Users } from 'lucide-react';
import { useWorldStore } from '../store/useWorldStore';
import { AGENT_PROFILES } from '../engine/agents';

function formatClock(clockMinutes: number): string {
  const total = Math.floor(clockMinutes) % (24 * 60);
  const normalized = total < 0 ? total + 24 * 60 : total;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export default function TopBar() {
  const clockMinutes = useWorldStore((s) => s.clockMinutes);
  const agentViews = useWorldStore((s) => s.agentViews);
  const mode = useWorldStore((s) => s.mode);
  const serverConnected = useWorldStore((s) => s.serverConnected);
  const isLive = mode === 'LIVE_MODE' && serverConnected;

  const activeCount = Object.values(agentViews).filter(
    (v) => v.state !== 'idle' && v.state !== 'sitting',
  ).length;

  return (
    <div className="glass w-full rounded-2xl px-4 py-2">
      <div className="flex items-center gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/25">
            <Bot className="h-5 w-5 text-amber-200" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold">AI Agent Living World</div>
            <div className="text-[11px] opacity-70">Agent Command Center</div>
          </div>
        </div>

        {/* Mode chip — honest label, driven by the real socket state (Hard Rule 1) */}
        <div className="flex flex-col items-start gap-0.5">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
              LIVE_MODE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-500/25 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
              DEMO_MODE
            </span>
          )}
          <span className="text-[10px] opacity-70">
            {isLive
              ? 'Server connected — telemetry bridge live'
              : 'Server offline — local life simulation'}
          </span>
        </div>

        <div className="flex-1" />

        {/* World clock */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 opacity-80" />
          <div className="leading-tight">
            <div className="font-mono text-sm font-semibold">
              {formatClock(clockMinutes)}
            </div>
            <div className="text-[10px] opacity-70">World time</div>
          </div>
        </div>

        {/* Active agents */}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 opacity-80" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">
              Active {activeCount}/{AGENT_PROFILES.length}
            </div>
            <div className="text-[10px] opacity-70">agents active</div>
          </div>
        </div>

        {/* API cost */}
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 opacity-80" />
          <div className="leading-tight">
            <div className="font-mono text-sm font-semibold">$0.00</div>
            <div className="text-[10px] opacity-70">API cost</div>
          </div>
        </div>
      </div>
    </div>
  );
}
