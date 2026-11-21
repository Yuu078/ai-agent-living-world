import { Download } from 'lucide-react';
import type { ArtifactPayload } from '@living-world/shared';
import { downloadArtifact } from '../engine/api';

/** Inline viewer for one artifact: filename, raw content, download. */
export default function ArtifactView({ artifact }: { artifact: ArtifactPayload }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] opacity-80">
          {artifact.filename}
        </span>
        <button
          type="button"
          onClick={() => downloadArtifact(artifact)}
          className="glass-button flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
        >
          <Download className="h-3 w-3" />
          Download
        </button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed opacity-90">
        {artifact.contentText}
      </pre>
    </div>
  );
}
