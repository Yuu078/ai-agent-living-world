import { useEffect } from 'react';
import WorldCanvas from './scene/WorldCanvas';
import TopBar from './ui/TopBar';
import Sidebar from './ui/Sidebar';
import TasksPanel from './ui/TasksPanel';
import MeetingsPanel from './ui/MeetingsPanel';
import BuildPanel from './ui/BuildPanel';
import InspectorPanel from './ui/InspectorPanel';
import BottomDock from './ui/BottomDock';
import { useWorldStore } from './store/useWorldStore';
import { useDataStore } from './store/useDataStore';
import { simulation } from './engine/simulation';
import { disposeSocketBridge, initSocketBridge } from './engine/socketBridge';

export default function App() {
  const activePanel = useDataStore((s) => s.activePanel);

  useEffect(() => {
    initSocketBridge();
    void useDataStore.getState().refreshAll();
    simulation.onViewChange = (id, view) => {
      useWorldStore.getState().syncAgentView(id, view);
    };
    // Initial sync so the UI reflects the simulation before the first change.
    for (const agent of simulation.agents) {
      useWorldStore.getState().syncAgentView(agent.profile.id, {
        state: agent.state,
        zone: agent.zone,
        thoughtBubble: agent.thoughtBubble,
        floor: agent.floor,
      });
    }
    return () => {
      simulation.onViewChange = null;
      disposeSocketBridge();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <WorldCanvas />
      </div>

      {/* Overlay UI — clicks pass through except on the panels themselves */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2"
          style={{ width: 'min(880px, 92vw)' }}
        >
          <TopBar />
        </div>

        <div className="pointer-events-auto absolute left-3 top-20">
          {activePanel === 'tasks' ? (
            <TasksPanel />
          ) : activePanel === 'meetings' ? (
            <MeetingsPanel />
          ) : activePanel === 'build' ? (
            <BuildPanel />
          ) : (
            <Sidebar />
          )}
        </div>

        <div className="pointer-events-auto absolute right-3 top-20">
          <InspectorPanel />
        </div>

        <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2">
          <BottomDock />
        </div>
      </div>
    </div>
  );
}
