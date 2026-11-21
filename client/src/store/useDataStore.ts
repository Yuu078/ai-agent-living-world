import { create } from 'zustand';
import type {
  ArtifactPayload,
  ChatMessagePayload,
  MeetingPayload,
  TaskPayload,
  WorldStats,
} from '@living-world/shared';
import { api } from '../engine/api';

export type LeftPanel = 'world' | 'tasks' | 'meetings';

/**
 * Server-data store (Phase 3): tasks, artifacts, meetings, chat and
 * token stats mirrored from the REST API. Refresh failures (server
 * offline) are swallowed — the last known data stays on screen and
 * the TopBar mode chip already tells the user we are in DEMO_MODE.
 */
interface DataStore {
  activePanel: LeftPanel;
  setActivePanel: (p: LeftPanel) => void;
  tasks: TaskPayload[];
  artifacts: ArtifactPayload[];
  meetings: MeetingPayload[];
  stats: WorldStats | null;
  chatByAgent: Record<string, ChatMessagePayload[]>;
  refreshTasks: () => Promise<void>;
  refreshArtifacts: () => Promise<void>;
  refreshMeetings: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshAll: () => Promise<void>;
  loadChat: (agentId: string) => Promise<void>;
  setChat: (agentId: string, messages: ChatMessagePayload[]) => void;
}

const quiet = async (fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
  } catch {
    /* server offline — keep last known data */
  }
};

export const useDataStore = create<DataStore>((set, get) => ({
  activePanel: 'world',
  setActivePanel: (activePanel) => set({ activePanel }),
  tasks: [],
  artifacts: [],
  meetings: [],
  stats: null,
  chatByAgent: {},
  refreshTasks: () =>
    quiet(async () => set({ tasks: await api.listTasks() })),
  refreshArtifacts: () =>
    quiet(async () => set({ artifacts: await api.listArtifacts() })),
  refreshMeetings: () =>
    quiet(async () => set({ meetings: await api.listMeetings() })),
  refreshStats: () => quiet(async () => set({ stats: await api.stats() })),
  refreshAll: async () => {
    await Promise.all([
      get().refreshTasks(),
      get().refreshArtifacts(),
      get().refreshMeetings(),
      get().refreshStats(),
    ]);
  },
  loadChat: (agentId) =>
    quiet(async () => {
      const res = await api.chatHistory(agentId);
      set((s) => ({
        chatByAgent: { ...s.chatByAgent, [agentId]: res.messages },
      }));
    }),
  setChat: (agentId, messages) =>
    set((s) => ({ chatByAgent: { ...s.chatByAgent, [agentId]: messages } })),
}));
