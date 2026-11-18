// `npm run dev`: start the local Kalshi API (win-prediction/http_api.py) and the
// Vite dev server together; Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiDir = join(root, '..', 'win-prediction');

const python =
  [join(apiDir, '.venv', 'bin', 'python'), join(apiDir, '.venv', 'Scripts', 'python.exe')].find(existsSync) ??
  (process.platform === 'win32' ? 'python' : 'python3');

const children = [
  spawn(python, ['http_api.py'], { cwd: apiDir, stdio: 'inherit' }),
  spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill();
  process.exit(code);
}

for (const c of children) c.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
