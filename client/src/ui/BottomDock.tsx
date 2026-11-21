import {
  Boxes,
  Crosshair,
  Gauge,
  LayoutGrid,
  Orbit,
  Slice,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { CameraPreset, QualityPreset } from '@living-world/shared';
import { useWorldStore } from '../store/useWorldStore';
import { simulation } from '../engine/simulation';

const QUALITY_OPTIONS: readonly { value: QualityPreset; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'auto', label: 'Auto' },
];

interface CameraPresetOption {
  preset: CameraPreset;
  label: string;
  Icon: LucideIcon;
}

const CAMERA_PRESETS: readonly CameraPresetOption[] = [
  { preset: 'isometric', label: 'Iso', Icon: Boxes },
  { preset: 'orbit', label: 'Orbit', Icon: Orbit },
  { preset: 'top', label: 'Top', Icon: LayoutGrid },
  { preset: 'follow', label: 'Follow', Icon: Crosshair },
];

const SPEEDS: readonly (1 | 2 | 4)[] = [1, 2, 4];

function Separator() {
  return <div className="mx-1 h-6 w-px bg-white/15" />;
}

export default function BottomDock() {
  const cameraPreset = useWorldStore((s) => s.cameraPreset);
  const setCameraPreset = useWorldStore((s) => s.setCameraPreset);
  const cutaway = useWorldStore((s) => s.cutaway);
  const setCutaway = useWorldStore((s) => s.setCutaway);
  const speed = useWorldStore((s) => s.speed);
  const setSpeed = useWorldStore((s) => s.setSpeed);
  const quality = useWorldStore((s) => s.quality);
  const setQuality = useWorldStore((s) => s.setQuality);
  const crowdEnabled = useWorldStore((s) => s.crowdEnabled);
  const setCrowdEnabled = useWorldStore((s) => s.setCrowdEnabled);
  const fps = useWorldStore((s) => s.fps);

  const toggleCrowd = () => {
    const next = !crowdEnabled;
    simulation.setCrowdCount(next ? 18 : 0);
    setCrowdEnabled(next);
  };

  return (
    <div className="glass rounded-full px-2 py-2">
      <div className="flex items-center gap-1">
        {/* Camera presets */}
        {CAMERA_PRESETS.map(({ preset, label, Icon }) => (
          <button
            key={preset}
            type="button"
            onClick={() => setCameraPreset(preset)}
            className={`glass-button flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
              cameraPreset === preset ? 'active' : ''
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}

        <Separator />

        {/* Cutaway toggle */}
        <button
          type="button"
          onClick={() => setCutaway(!cutaway)}
          className={`glass-button flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
            cutaway ? 'active' : ''
          }`}
        >
          <Slice className="h-4 w-4" />
          Cutaway
        </button>

        <Separator />

        {/* Speed controls */}
        <div className="flex items-center gap-1">
          <Gauge className="mx-1 h-4 w-4 opacity-80" />
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`glass-button rounded-full px-3 py-1.5 text-sm ${
                speed === s ? 'active' : ''
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <Separator />

        {/* Quality presets (Phase 4) */}
        <div className="flex items-center gap-1">
          <Sparkles className="mx-1 h-4 w-4 opacity-80" />
          {QUALITY_OPTIONS.map((q) => (
            <button
              key={q.value}
              type="button"
              onClick={() => setQuality(q.value)}
              className={`glass-button rounded-full px-2.5 py-1.5 text-sm ${
                quality === q.value ? 'active' : ''
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>

        <Separator />

        {/* Crowd toggle + FPS (Phase 4) */}
        <button
          type="button"
          onClick={toggleCrowd}
          className={`glass-button flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
            crowdEnabled ? 'active' : ''
          }`}
          title="Toggle the guest crowd (instanced rendering)"
        >
          <Users className="h-4 w-4" />
          Crowd
        </button>
        <span className="px-1 text-xs tabular-nums opacity-80">
          {fps > 0 ? `${fps} FPS` : '— FPS'}
        </span>
      </div>
    </div>
  );
}
