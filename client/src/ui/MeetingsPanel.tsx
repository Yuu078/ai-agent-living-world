import { useEffect, useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { api } from '../engine/api';
import { AGENT_PROFILES } from '../engine/agents';
import { useDataStore } from '../store/useDataStore';

const DEFAULT_PARTICIPANTS = ['agent-manager-1', 'agent-researcher-1', 'agent-designer-1'];

export default function MeetingsPanel() {
  const setActivePanel = useDataStore((s) => s.setActivePanel);
  const meetings = useDataStore((s) => s.meetings);
  const refreshMeetings = useDataStore((s) => s.refreshMeetings);

  const [topic, setTopic] = useState('');
  const [selected, setSelected] = useState<string[]>(DEFAULT_PARTICIPANTS);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void refreshMeetings();
    const timer = setInterval(() => void refreshMeetings(), 2500);
    return () => clearInterval(timer);
  }, [refreshMeetings]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  const start = async () => {
    if (!topic.trim() || selected.length < 2 || starting) return;
    setStarting(true);
    setFormError(null);
    try {
      const meeting = await api.startMeeting(topic.trim(), selected);
      setTopic('');
      setOpenId(meeting.id);
      await refreshMeetings();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const sorted = [...meetings].reverse();

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
        <div className="text-sm font-semibold">Meetings — Live Discussion</div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Meeting topic…"
          className="w-full rounded-lg bg-black/30 p-2 text-[13px] outline-none placeholder:opacity-50"
        />
        <div className="mt-2 grid grid-cols-2 gap-1">
          {AGENT_PROFILES.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-1.5 text-[12px]"
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className="truncate">
                {p.name} · {p.role}
              </span>
            </label>
          ))}
        </div>
        {formError ? (
          <p className="mt-1 text-[11px] leading-snug text-red-200">{formError}</p>
        ) : null}
        <button
          type="button"
          disabled={!topic.trim() || selected.length < 2 || starting}
          onClick={() => void start()}
          className="glass-button mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
        >
          <Users className="h-4 w-4" />
          {starting ? 'Starting…' : 'Start meeting'}
        </button>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {sorted.length === 0 ? (
          <p className="text-[12px] leading-relaxed opacity-70">
            No meetings yet. Start one above — participants walk to the
            meeting room and discuss for real via the LLM.
          </p>
        ) : (
          sorted.map((m) => {
            const open = openId === m.id;
            return (
              <div
                key={m.id}
                className="rounded-xl border border-white/10 bg-white/5 p-2"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : m.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 truncate text-[13px] font-medium" title={m.topic}>
                      {m.topic}
                    </div>
                    <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold">
                      {m.status}
                    </span>
                  </div>
                  <div className="text-[11px] opacity-70">
                    {m.participantIds
                      .map(
                        (id) =>
                          AGENT_PROFILES.find((p) => p.id === id)?.name ?? id,
                      )
                      .join(', ')}
                  </div>
                </button>
                {open ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {m.transcript.length === 0 ? (
                      <p className="text-[12px] opacity-70">
                        Discussion has not produced turns yet…
                      </p>
                    ) : (
                      m.transcript.map((turn, i) => (
                        <div key={i} className="rounded-lg bg-black/25 p-2">
                          <div className="text-[11px] font-semibold opacity-80">
                            {turn.agentName}
                          </div>
                          <p className="text-[12px] leading-relaxed">{turn.text}</p>
                        </div>
                      ))
                    )}
                    {m.actionItems.length > 0 ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold tracking-widest opacity-70">
                          ACTION ITEMS
                        </div>
                        <ul className="flex flex-col gap-0.5">
                          {m.actionItems.map((item, i) => (
                            <li key={i} className="text-[12px] leading-snug">
                              ☐ {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="text-[11px] opacity-60">
                      Full minutes (with this transcript) are saved as an
                      artifact — find them under the minutes author in the
                      Inspector.
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
