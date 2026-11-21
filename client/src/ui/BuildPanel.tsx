/**
 * BuildPanel (Phase 4) — Build Mode controls.
 *
 * Pick a furniture kind, hover the floor (the ghost is green only when
 * the real placement check passes against the live A* grid), click to
 * place. Placements persist to the server's `world_objects` table and
 * the pathfinding grid rebuilds immediately — agents walk around new
 * furniture, never through it. Select a placed object to move (click a
 * new spot), rotate (R) or delete (Del).
 */
import { useEffect } from 'react';
import {
  ArrowLeft,
  Armchair,
  BookOpen,
  Hammer,
  Leaf,
  Monitor,
  Presentation,
  RotateCw,
  Table2,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FurnitureType as FT } from '@living-world/shared';
import { useDataStore } from '../store/useDataStore';
import { useWorldStore } from '../store/useWorldStore';
import { useBuildStore } from '../store/useBuildStore';
import { FURNITURE_DEFS } from '../engine/worldLayout';

const PALETTE: readonly { type: FT; Icon: LucideIcon }[] = [
  { type: 'desk', Icon: Monitor },
  { type: 'table', Icon: Table2 },
  { type: 'plant', Icon: Leaf },
  { type: 'bookshelf', Icon: BookOpen },
  { type: 'sofa', Icon: Armchair },
  { type: 'whiteboard', Icon: Presentation },
];

export default function BuildPanel() {
  const setActivePanel = useDataStore((s) => s.setActivePanel);
  const worldObjects = useDataStore((s) => s.worldObjects);
  const activeFloor = useWorldStore((s) => s.activeFloor);
  const setBuildMode = useWorldStore((s) => s.setBuildMode);
  const placingType = useBuildStore((s) => s.placingType);
  const setPlacingType = useBuildStore((s) => s.setPlacingType);
  const ghost = useBuildStore((s) => s.ghost);
  const selectedId = useBuildStore((s) => s.selectedId);
  const select = useBuildStore((s) => s.select);
  const notice = useBuildStore((s) => s.notice);
  const busy = useBuildStore((s) => s.busy);

  const placed = worldObjects.filter((o) => o.metadata?.userPlaced === true);
  const placedHere = placed.filter(
    (o) => (o.metadata?.floor === 2 ? 2 : 1) === activeFloor,
  );
  const selected = placed.find((o) => o.id === selectedId) ?? null;

  // Keyboard: R rotates (palette or selection), Delete removes selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const s = useBuildStore.getState();
      if (e.key === 'r' || e.key === 'R') {
        if (s.placingType) s.rotate();
        else if (s.selectedId) void s.rotateSelected();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        void s.deleteSelected();
      }
      if (e.key === 'Escape') {
        s.setPlacingType(null);
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => {
    setBuildMode(false);
    setPlacingType(null);
    select(null);
    setActivePanel('world');
  };

  return (
    <div className="glass w-72 rounded-2xl p-3">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="glass-button rounded-lg p-1.5"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Hammer className="h-4 w-4" />
            Build Mode
          </div>
          <span className="ml-auto flex gap-1">
            {([1, 2] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => useWorldStore.getState().setActiveFloor(f)}
                className={`glass-button rounded-full px-2 py-0.5 text-[11px] ${
                  activeFloor === f ? 'active' : ''
                }`}
              >
                F{f}
              </button>
            ))}
          </span>
        </div>

        <p className="text-[11px] leading-snug opacity-70">
          Placements save to the server and rebuild the A* obstacle grid —
          agents path around new furniture. Use the F1/F2 toggle above to
          build on either floor.
        </p>

        {/* Palette */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold tracking-widest opacity-70">
            PLACE FURNITURE
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {PALETTE.map(({ type, Icon }) => {
              const def = FURNITURE_DEFS[type];
              const active = placingType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPlacingType(active ? null : type)}
                  className={`glass-button flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] ${
                    active ? 'active' : ''
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {def.label}
                  <span className="opacity-60">
                    {def.w}×{def.d}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ghost / placement status */}
        {placingType && (
          <div
            className={`rounded-xl px-2.5 py-2 text-[12px] leading-snug ${
              ghost
                ? ghost.ok
                  ? 'bg-emerald-500/20'
                  : 'bg-red-500/20'
                : 'bg-white/5'
            }`}
          >
            {ghost
              ? ghost.ok
                ? `Placing ${FURNITURE_DEFS[placingType].label} at (${ghost.cell.gx}, ${ghost.cell.gz}) — click to place.`
                : (ghost.reason ?? 'Cannot place there.')
              : `Hover the floor to preview the ${FURNITURE_DEFS[placingType].label}. Press R to rotate.`}
            <button
              type="button"
              onClick={() => useBuildStore.getState().rotate()}
              className="glass-button ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
            >
              <RotateCw className="h-3 w-3" /> Rotate (R)
            </button>
          </div>
        )}

        {/* Selection */}
        {selected && !placingType && (
          <div className="rounded-xl bg-amber-500/15 px-2.5 py-2 text-[12px] leading-snug">
            <div className="mb-1 font-medium">
              Selected:{' '}
              {FURNITURE_DEFS[(selected.metadata?.furnitureType as FT) ?? 'desk']?.label ??
                String(selected.metadata?.furnitureType ?? 'object')}
              <span className="opacity-60"> · Floor {selected.metadata?.floor === 2 ? 2 : 1}</span>
            </div>
            <div className="mb-2 opacity-80">
              Click a new spot to move it, or:
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void useBuildStore.getState().rotateSelected()}
                className="glass-button flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
              >
                <RotateCw className="h-3 w-3" /> Rotate (R)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void useBuildStore.getState().deleteSelected()}
                className="glass-button flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
              >
                <Trash2 className="h-3 w-3" /> Delete (Del)
              </button>
            </div>
          </div>
        )}

        {/* Placed objects on this floor */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold tracking-widest opacity-70">
            ON FLOOR {activeFloor} ({placedHere.length})
          </div>
          {placedHere.length === 0 ? (
            <div className="text-[12px] opacity-60">
              Nothing placed yet — built-in furniture is locked.
            </div>
          ) : (
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
              {placedHere.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setPlacingType(null);
                    select(selectedId === o.id ? null : o.id);
                  }}
                  className={`glass-button w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] ${
                    selectedId === o.id ? 'active' : ''
                  }`}
                >
                  {FURNITURE_DEFS[(o.metadata?.furnitureType as FT) ?? 'desk']?.label ??
                    String(o.metadata?.furnitureType)}
                  <span className="float-right opacity-60">
                    ({o.posX}, {o.posZ})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {notice && (
          <div className="rounded-xl bg-white/5 px-2.5 py-2 text-[12px] leading-snug">
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}
