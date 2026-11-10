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

const apiPort = Number(process.env.E2E_API_PORT ?? 3000);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
if (await portOpen(apiPort) || await portOpen(webPort)) throw new Error(`E2E requires ports ${apiPort} and ${webPort} to be free; stop other local servers first.`);
const api = spawn(process.execPath, ['apps/api/dist/main.js'], { stdio: 'inherit', env: { ...process.env, PORT: String(apiPort), DATABASE_PATH: ':memory:', RISK_OBSERVATION_SECONDS: '1', PUBLIC_DEMO: '1', DEMO_ACCESS_TOKEN: 'e2e-demo-access-token-2026-11-05-test-only', DEEPSEEK_API_KEY: 'e2e-placeholder-never-used', BASELINE_PROVIDER: 'fake', RISK_REVIEW_PROVIDER: 'fake', MESSAGE_PROVIDER: 'fake' } });
const web = spawn(process.execPath, ['apps/web/node_modules/vite/bin/vite.js', 'apps/web', '--host', '127.0.0.1', '--port', String(webPort)], { stdio: 'inherit', env: { ...process.env, ANMAI_API_PORT: String(apiPort) } });
try {
  await Promise.all([ready(`http://127.0.0.1:${apiPort}/api/health`, api, 'API'), ready(`http://127.0.0.1:${webPort}`, web, 'Web')]);
  const tests = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, E2E_BASE_URL: `http://127.0.0.1:${webPort}` } });
  const code = await new Promise(resolve => tests.once('exit', resolve));
  if (code !== 0) process.exitCode = code || 1;
} finally {
  api.kill('SIGKILL');
  web.kill('SIGKILL');
}
