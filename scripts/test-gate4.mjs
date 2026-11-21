#!/usr/bin/env node
/**
 * Gate 4 API tests (Phase 4) — Build Mode persistence, Floor 2 seeds,
 * world-objects socket broadcast, and the <think> artifact cleanup.
 *
 * Requires the Phase 4 server on :4000 (it is restarted by the test
 * runbook before this script). Creates two throwaway placed objects
 * and deletes them again in a finally block.
 *
 * Run: npm run test:gate4
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'package.json'));
const Database = require('better-sqlite3');
const { io } = require('socket.io-client');

const BASE = process.env.LW_SERVER ?? 'http://localhost:4000';

function dbPath() {
  try {
    const env = readFileSync(resolve(root, 'server/.env'), 'utf8');
    const m = env.match(/^DATABASE_PATH=(.+)$/m);
    if (m) return resolve(root, 'server', m[1].trim());
  } catch { /* fall through */ }
  return resolve(root, 'server/data/living-world.db');
}

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const TEST_DESK = {
  id: 'gate4-test-desk',
  type: 'desk',
  room: 'open_office',
  posX: 16, posY: 0, posZ: 16, rotY: 0,
  metadata: {
    userPlaced: true, floor: 1, furnitureType: 'desk', rotation: 0,
    footprint: { x0: 16, z0: 16, x1: 17, z1: 16 },
  },
};
const TEST_PLANT = {
  id: 'gate4-test-plant',
  type: 'plant',
  room: 'floor2',
  posX: 20, posY: 3.4, posZ: 16, rotY: 0,
  metadata: {
    userPlaced: true, floor: 2, furnitureType: 'plant', rotation: 0,
    footprint: { x0: 20, z0: 16, x1: 20, z1: 16 },
  },
};

async function main() {
  console.log('\n[Gate 4] health + seeds');
  const health = await (await fetch(`${BASE}/health`)).json();
  check('GET /health reports phase >= 4', health.phase >= 4, `phase=${health.phase}`);

  let world = (await (await fetch(`${BASE}/api/world`)).json()).objects;
  check('GET /api/world returns an array', Array.isArray(world));
  const f2Seeds = ['world2-exec-desk', 'world2-exec-sofa', 'world2-lab-bench-1', 'world2-lab-bench-2', 'world2-lab-shelf'];
  check(
    'Floor 2 seed objects present',
    f2Seeds.every((id) => world.some((o) => o.id === id)),
    `ids=${world.map((o) => o.id).join(',')}`,
  );

  console.log('\n[Gate 4] Build Mode persistence');
  const db = new Database(dbPath(), { readonly: true });
  try {
    const postRes = await fetch(`${BASE}/api/world`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objects: [TEST_DESK] }),
    });
    check('POST /api/world (placed desk) accepted', postRes.ok, `status=${postRes.status}`);
    world = (await (await fetch(`${BASE}/api/world`)).json()).objects;
    check(
      'placed desk survives a fresh GET (persisted)',
      world.some((o) => o.id === TEST_DESK.id && o.metadata?.userPlaced === true),
    );
    const row = db.prepare('SELECT id, metadata_json FROM world_objects WHERE id = ?').get(TEST_DESK.id);
    check('placed desk row exists in SQLite', !!row);

    console.log('\n[Gate 4] socket broadcast');
    const socket = io(BASE, { transports: ['websocket'], timeout: 5000 });
    const eventPromise = new Promise((resolvePromise) => {
      const timer = setTimeout(() => resolvePromise(null), 6000);
      socket.on('world:objects_changed', (payload) => {
        if (payload?.objects?.some((o) => o.id === TEST_PLANT.id)) {
          clearTimeout(timer);
          resolvePromise(payload);
        }
      });
    });
    await new Promise((res) => socket.on('connect', res));
    const post2 = await fetch(`${BASE}/api/world`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objects: [TEST_PLANT] }),
    });
    check('POST /api/world (placed plant, floor 2) accepted', post2.ok, `status=${post2.status}`);
    const event = await eventPromise;
    check('world:objects_changed broadcast received with the new object', !!event);
    socket.disconnect();

    console.log('\n[Gate 4] think-tag cleanup state');
    const thinkCount = db
      .prepare("SELECT COUNT(*) AS n FROM artifacts WHERE content_text LIKE '%<think>%'")
      .get().n;
    check('zero artifacts contain raw <think> tags', thinkCount === 0, `count=${thinkCount}`);
  } finally {
    // Clean up the throwaway objects whatever happened above.
    for (const id of [TEST_DESK.id, TEST_PLANT.id]) {
      await fetch(`${BASE}/api/world/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    db.close();
  }
  world = (await (await fetch(`${BASE}/api/world`)).json()).objects;
  check(
    'test objects deleted again (world back to seeds only)',
    !world.some((o) => o.id === TEST_DESK.id || o.id === TEST_PLANT.id),
  );

  console.log(`\nRESULT: ${passed}/${passed + failed} Gate 4 API checks passed`);
  if (failed > 0) {
    console.log('GATE 4 API: FAILED');
    process.exit(1);
  }
  console.log('GATE 4 API: PASSED');
}

main().catch((err) => {
  console.error('GATE 4 API: ERROR', err);
  process.exit(1);
});
