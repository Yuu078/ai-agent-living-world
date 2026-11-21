/**
 * Cleanup: strip <think>…</think> scratchpad blocks from stored artifacts.
 *
 * Older artifacts (written before think-tag stripping was applied on
 * every write path) may still contain `<think>` blocks in
 * `content_text`. This script applies the same stripping logic as
 * `stripThinkTags` in server/src/engine/llmAdapter.ts:
 *   - remove complete `<think>…</think>` blocks
 *   - drop a trailing unclosed `<think>` (truncated mid-thought)
 *   - trim the result
 *
 * Artifacts that become empty after stripping are left empty and
 * reported — no replacement content is fabricated.
 *
 * Secrets are read from server/.env and never printed.
 * Run: node scripts/clean-think-artifacts.mjs   (from repo root)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'server');
const serverRequire = createRequire(resolve(serverDir, 'package.json'));
const Database = serverRequire('better-sqlite3');

const env = {};
for (const line of readFileSync(resolve(serverDir, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const DB_PATH = resolve(serverDir, env.DATABASE_PATH ?? './data/living-world.db');

function stripThinkTags(text) {
  let content = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const danglingThink = content.indexOf('<think>');
  if (danglingThink >= 0) content = content.slice(0, danglingThink).trim();
  return content;
}

const db = new Database(DB_PATH);
const rows = db
  .prepare("SELECT id, filename, content_text FROM artifacts WHERE content_text LIKE '%<think>%'")
  .all();

let cleaned = 0;
let emptied = 0;
const update = db.prepare('UPDATE artifacts SET content_text = ? WHERE id = ?');
for (const row of rows) {
  const before = row.content_text;
  const after = stripThinkTags(before);
  update.run(after, row.id);
  cleaned++;
  if (after.length === 0) emptied++;
  console.log(`${row.id}  ${row.filename}  ${before.length} -> ${after.length}`);
}
db.close();

console.log(`\nTotal cleaned: ${cleaned}`);
console.log(`Became empty after strip: ${emptied}`);
