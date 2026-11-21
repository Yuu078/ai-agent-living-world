/**
 * Server configuration.
 *
 * Loads `.env` from the server package root (resolved relative to this
 * file via `import.meta.url`, never the process cwd), so the server
 * behaves identically whether it is started from the repo root, the
 * package folder, `tsx` (src/) or compiled output (dist/).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Absolute path of the server package root (parent of src/ and dist/). */
export const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

dotenv.config({ path: path.join(PACKAGE_ROOT, '.env') });

const rawDatabasePath = process.env.DATABASE_PATH ?? './data/living-world.db';
const databasePath = path.isAbsolute(rawDatabasePath)
  ? rawDatabasePath
  : path.resolve(PACKAGE_ROOT, rawDatabasePath);

const parsedPort = Number(process.env.PORT ?? 4000);

export const config = {
  port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4000,
  databasePath,
  telemetrySecret: process.env.TELEMETRY_SECRET ?? 'dev-secret-123',
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'https://openrouter.ai/api/v1',
    apiKey: process.env.LLM_API_KEY ?? '',
    defaultModel: process.env.LLM_DEFAULT_MODEL ?? 'google/gemini-2.5-flash',
  },
} as const;
