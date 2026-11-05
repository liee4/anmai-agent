import { spawn } from 'node:child_process';
import { connect } from 'node:net';

function portOpen(port) {
  return new Promise(resolve => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(700, () => { socket.destroy(); resolve(false); });
  });
}

async function ready(url, process, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (process.exitCode !== null) throw new Error(`${label} exited before becoming ready`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${label} did not start within 10 seconds`);
}

if (await portOpen(3000) || await portOpen(5173)) throw new Error('E2E requires ports 3000 and 5173 to be free; stop other local servers first.');
const api = spawn(process.execPath, ['apps/api/dist/main.js'], { stdio: 'inherit', env: { ...process.env, DATABASE_PATH: ':memory:', RISK_OBSERVATION_SECONDS: '1', PUBLIC_DEMO: '1', DEMO_ACCESS_TOKEN: 'e2e-demo-access-token-2026-11-05-test-only', DEEPSEEK_API_KEY: 'e2e-placeholder-never-used', BASELINE_PROVIDER: 'fake', RISK_REVIEW_PROVIDER: 'fake', MESSAGE_PROVIDER: 'fake' } });
const web = spawn(process.execPath, ['apps/web/node_modules/vite/bin/vite.js', 'apps/web', '--host', '127.0.0.1'], { stdio: 'inherit' });
try {
  await Promise.all([ready('http://127.0.0.1:3000/api/health', api, 'API'), ready('http://127.0.0.1:5173', web, 'Web')]);
  const tests = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], { stdio: 'inherit' });
  const code = await new Promise(resolve => tests.once('exit', resolve));
  if (code !== 0) process.exitCode = code || 1;
} finally {
  api.kill('SIGKILL');
  web.kill('SIGKILL');
}
