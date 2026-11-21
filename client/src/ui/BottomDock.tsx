import {
  Boxes,
  Crosshair,
  Gauge,
  LayoutGrid,
  Orbit,
  Slice,
  type LucideIcon,
} from 'lucide-react';
import type { CameraPreset } from '@living-world/shared';
import { useWorldStore } from '../store/useWorldStore';

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
      </div>
    </div>
  );
}
