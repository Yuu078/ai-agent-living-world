/**
 * Phase 2 client-logic test: external telemetry events drive the Simulation
 * exactly per the Visual Mapping Law (AGENTS.md Section 5) — no WebGL needed.
 *
 * Proves, at the logic level:
 *  1. A `coffee_break` event walks Kai (agent-programmer-1) to the coffee bar
 *     via A* and parks him there under external control (lifeSim must NOT
 *     steal him while controlled).
 *  2. The Gate 2 example event (state `typing`, targetZone `desk`,
 *     thoughtBubble "Auditing smart contract...") then walks him back to HIS
 *     desk chair, lands in state `typing` with the exact bubble.
 *  3. An `idle` event releases control back to lifeSim.
 *
 * Run: npm run test:telemetry-client   (from repo root)
 */
import { Simulation } from '../client/src/engine/simulation';
import { DESKS, isWalkable } from '../client/src/engine/worldLayout';
import type { WorldEvent } from '../shared/types';

// Deterministic RNG so lifeSim behaviour of the OTHER agents is stable.
let seed = 123456789;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const sim = new Simulation(rng);
const kai = sim.getAgent('agent-programmer-1');
if (!kai) {
  console.error('FAIL  agent-programmer-1 not found in simulation');
  process.exit(1);
}

const ev = (partial: Partial<WorldEvent>): WorldEvent => ({
  agentId: 'agent-programmer-1',
  source: 'external_webhook',
  state: 'idle',
  targetZone: 'desk',
  timestamp: Date.now(),
  ...partial,
});

/** Step the world in fixed 50ms slices until `done` or the sim-time budget ends. */
function stepUntil(done: () => boolean, budgetSeconds: number): boolean {
  let t = 0;
  while (t < budgetSeconds) {
    if (done()) return true;
    sim.update(0.05, 1);
    t += 0.05;
  }
  return done();
}

/* --- 1. coffee_break event: walk to coffee bar, stay under control ------- */
sim.applyExternalEvent(ev({ state: 'coffee_break', targetZone: 'coffee_bar' }));
check('coffee event marks agent as externally controlled', sim.isControlled(kai.profile.id));
const arrivedCoffee = stepUntil(() => kai.state === 'coffee_break', 30);
check('agent walks to coffee bar and arrives in coffee_break state', arrivedCoffee, `state=${kai.state} zone=${kai.zone}`);
check('agent zone is coffee_bar', kai.zone === 'coffee_bar');
check(
  'agent stands on a walkable cell',
  isWalkable(sim.grid, kai.targetCell.gx, kai.targetCell.gz),
  `cell=${kai.targetCell.gx},${kai.targetCell.gz}`,
);
// lifeSim must not steal a controlled agent even after long idle time.
const coffeeCell = { ...kai.targetCell };
stepUntil(() => false, 25); // 25 sim-seconds pass
check(
  'controlled agent is NOT stolen by lifeSim',
  kai.state === 'coffee_break' && kai.targetCell.gx === coffeeCell.gx && kai.targetCell.gz === coffeeCell.gz,
  `state=${kai.state} cell=${kai.targetCell.gx},${kai.targetCell.gz}`,
);

/* --- 2. Gate 2 example event: typing at own desk, exact bubble ----------- */
sim.applyExternalEvent(
  ev({ state: 'typing', targetZone: 'desk', thoughtBubble: 'Auditing smart contract...' }),
);
const arrivedDesk = stepUntil(() => kai.state === 'typing', 30);
const ownChair = DESKS[kai.profile.deskIndex]!.chair;
check('agent walks back and arrives in typing state', arrivedDesk, `state=${kai.state} zone=${kai.zone}`);
check('agent zone is desk', kai.zone === 'desk');
check(
  'agent sits at his OWN desk chair',
  kai.targetCell.gx === ownChair.gx && kai.targetCell.gz === ownChair.gz,
  `cell=${kai.targetCell.gx},${kai.targetCell.gz} chair=${ownChair.gx},${ownChair.gz}`,
);
check(
  'thoughtBubble is exactly the event payload',
  kai.thoughtBubble === 'Auditing smart contract...',
  `bubble=${JSON.stringify(kai.thoughtBubble)}`,
);
stepUntil(() => false, 20);
check(
  'typing agent stays at desk under external control',
  kai.state === 'typing' && kai.thoughtBubble === 'Auditing smart contract...',
);

/* --- 3. idle event releases control to lifeSim ---------------------------- */
sim.applyExternalEvent(ev({ state: 'idle', targetZone: 'desk' }));
check('idle event releases external control', !sim.isControlled(kai.profile.id));
check('agent state is idle right after release', kai.state === 'idle');
// lifeSim should pick a new goal shortly after release (stayTimer 0.5s).
const resumed = stepUntil(() => kai.state === 'walking' || kai.state !== 'idle', 10);
check('lifeSim resumes driving the agent after release', resumed, `state=${kai.state}`);

console.log(failures === 0 ? '\nALL CLIENT TELEMETRY CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
