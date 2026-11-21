import type { AgentProfile } from '@living-world/shared';

/** The 6 resident agents of the HQ (seed roster; DB seed arrives in Phase 2). */
export const AGENT_PROFILES: AgentProfile[] = [
  { id: 'agent-manager-1', name: 'Nova', role: 'Manager', department: 'Ops', model: 'demo/manager', color: '#ffb05c', deskIndex: 0 },
  { id: 'agent-programmer-1', name: 'Kai', role: 'Programmer', department: 'Engineering', model: 'demo/coder', color: '#6ee7a0', deskIndex: 1 },
  { id: 'agent-programmer-2', name: 'Rin', role: 'Programmer', department: 'Engineering', model: 'demo/coder', color: '#7dd3fc', deskIndex: 2 },
  { id: 'agent-designer-1', name: 'Mika', role: 'Designer', department: 'Design', model: 'demo/designer', color: '#f9a8d4', deskIndex: 3 },
  { id: 'agent-researcher-1', name: 'Sora', role: 'Researcher', department: 'Research', model: 'demo/researcher', color: '#c4b5fd', deskIndex: 4 },
  { id: 'agent-qa-1', name: 'Bimo', role: 'QA Engineer', department: 'Engineering', model: 'demo/qa', color: '#fca5a5', deskIndex: 5 },
];
