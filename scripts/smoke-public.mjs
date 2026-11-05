import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => resolve(address.port)); });
});
const token = 'smoke-only-access-token-not-for-production-123';
const origin = `http://127.0.0.1:${port}`;
const api = spawn(process.execPath, ['apps/api/dist/main.js'], { env: { ...process.env, PORT: String(port), DATABASE_PATH: ':memory:', PUBLIC_DEMO: '1', DEMO_ACCESS_TOKEN: token, DEEPSEEK_API_KEY: 'smoke-only-never-used' }, stdio: 'ignore' });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (api.exitCode !== null) throw new Error(`API exited with code ${api.exitCode}`);
    try { ready = (await fetch(`${origin}/api/health`)).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Production API did not start');
  if ((await fetch(origin)).status !== 401) throw new Error('Public page accepted a visitor without a session');
  const join = await fetch(`${origin}/join/${token}`, { redirect: 'manual' });
  const cookie = join.headers.get('set-cookie');
  if (join.status !== 302 || !cookie) throw new Error('Judge link did not create a session');
  const page = await fetch(origin, { headers: { cookie } });
  const html = await page.text();
  if (!page.ok || !html.includes('安脉')) throw new Error('Built web page was not served');
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  if (!asset || !(await fetch(`${origin}${asset}`, { headers: { cookie } })).ok) throw new Error('Built JavaScript asset was not served');
  const mode = await fetch(`${origin}/api/settings/provider-mode`, { method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'deepseek' }) });
  if (!mode.ok || (await mode.json()).mode !== 'deepseek') throw new Error('Provider switch failed');
  process.stdout.write('Public production smoke passed\n');
} finally { api.kill('SIGKILL'); }
