/**
 * One-command UI development: starts the mock backend and Vite together.
 *
 *   npm run dev:mock
 *
 * The frontend is pointed at the mock automatically via VITE_BACKEND_URL.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_PORT = process.env.MOCK_PORT || '8000';

const mock = spawn('node', ['scripts/mock-backend.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT: MOCK_PORT },
});

const vite = spawn('npx', ['vite'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_BACKEND_URL: `http://127.0.0.1:${MOCK_PORT}` },
});

const shutdown = () => {
  mock.kill('SIGTERM');
  vite.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
mock.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`[dev:mock] mock backend exited with code ${code}`);
    shutdown();
  }
});
vite.on('exit', shutdown);
