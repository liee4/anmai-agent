import { expect, it } from 'vitest';
import { openDatabase } from '../../src/infra/database.js';
import { FakeClock } from '../../src/clock.js';
import { buildApp } from '../../src/app.js';
import { DemoSessions } from '../../src/features/demo/demo-session.js';
import { demoProviders } from '../../src/features/demo/demo-providers.js';
import type { BaselineGenerationRequest, EmergencyEvent } from '@anmai/contracts';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveWeb } from '../../src/serve-web.js';

const token = 'a-test-access-token-with-enough-entropy-123456';
function setup(key?: string) {
  const db = openDatabase(':memory:');
  const sessions = new DemoSessions(db, token, Boolean(key), 2, 3);
  const providers = demoProviders(sessions, { apiKey: key });
  const app = buildApp({ db, clock: new FakeClock(new Date('2026-11-05T00:00:00Z')), baselineProvider: providers.baseline, baselineProviderName: providers.nameFor, riskReviewProvider: providers.review, riskReviewProviderName: providers.nameFor, messageProvider: providers.message, messageProviderName: providers.nameFor, demoSessions: sessions });
  return { db, sessions, app };
}

it('requires a link, isolates two judges and never returns the API key', async () => {
  const { db, app } = setup('private-test-key');
  try {
    expect((await app.inject({ method: 'GET', url: '/api/session' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/join/wrong' })).statusCode).toBe(403);
    const a = await app.inject({ method: 'GET', url: `/join/${token}` });
    const b = await app.inject({ method: 'GET', url: `/join/${token}` });
    const cookieA = a.headers['set-cookie'] as string;
    const cookieB = b.headers['set-cookie'] as string;
    const sessionA = (await app.inject({ method: 'GET', url: '/api/session', headers: { cookie: cookieA } })).json();
    const sessionB = (await app.inject({ method: 'GET', url: '/api/session', headers: { cookie: cookieB } })).json();
    expect(sessionA.wearerId).not.toBe(sessionB.wearerId);
    expect(JSON.stringify(sessionA)).not.toContain('private-test-key');
    expect((await app.inject({ method: 'GET', url: `/api/dashboard/${sessionB.wearerId}`, headers: { cookie: cookieA } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/deadlines/run', headers: { cookie: cookieA } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/simulator/reset', headers: { cookie: cookieA }, payload: { wearerId: sessionB.wearerId, confirmation: 'RESET_DEMO_DATA' } })).statusCode).toBe(403);
    const severe = (await app.inject({ method: 'POST', url: '/api/simulator/worsening', headers: { cookie: cookieB }, payload: { wearerId: sessionB.wearerId } })).json();
    expect((await app.inject({ method: 'GET', url: `/api/events/${severe.event.eventId}`, headers: { cookie: cookieA } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/settings/provider-mode', headers: { cookie: cookieA }, payload: { mode: 'deepseek' } })).json()).toMatchObject({ mode: 'deepseek', deepseekConfigured: true });
    expect((await app.inject({ method: 'GET', url: '/api/settings/provider-mode', headers: { cookie: cookieB } })).json()).toMatchObject({ mode: 'fake' });
  } finally { await app.close(); db.close(); }
});

it('rejects DeepSeek without a backend key and blocks changes during an event', async () => {
  const { db, app } = setup();
  try {
    const cookie = (await app.inject({ method: 'GET', url: `/join/${token}` })).headers['set-cookie'] as string;
    const wearerId = (await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } })).json().wearerId;
    expect((await app.inject({ method: 'PUT', url: '/api/settings/provider-mode', headers: { cookie }, payload: { mode: 'deepseek' } })).statusCode).toBe(409);
    await app.inject({ method: 'POST', url: '/api/simulator/worsening', headers: { cookie }, payload: { wearerId } });
    expect((await app.inject({ method: 'PUT', url: '/api/settings/provider-mode', headers: { cookie }, payload: { mode: 'fake' } })).statusCode).toBe(409);
  } finally { await app.close(); db.close(); }
});

it('enforces both per-session and global DeepSeek call limits', () => {
  const { db, sessions } = setup('private-test-key');
  try {
    const a = sessions.create().wearer_id;
    const b = sessions.create().wearer_id;
    expect(sessions.switch(a, 'deepseek')).toBe('ok');
    sessions.consume(a); sessions.consume(a);
    expect(() => sessions.consume(a)).toThrow('session quota');
    expect(sessions.switch(b, 'deepseek')).toBe('ok');
    sessions.consume(b);
    expect(() => sessions.consume(b)).toThrow('global quota');
  } finally { db.close(); }
});

it('keeps the current provider while a model task is in flight', () => {
  const { db, sessions } = setup('private-test-key');
  try {
    const wearerId = sessions.create().wearer_id;
    const leave = sessions.enter(wearerId);
    expect(sessions.switch(wearerId, 'deepseek')).toBe('busy');
    expect(sessions.mode(wearerId)).toBe('fake');
    leave();
    expect(sessions.switch(wearerId, 'deepseek')).toBe('ok');
  } finally { db.close(); }
});

it('routes all three model tasks through the selected session mode', async () => {
  const db = openDatabase(':memory:');
  try {
    const sessions = new DemoSessions(db, token, true, 5, 10);
    const wearerId = sessions.create().wearer_id;
    expect(sessions.switch(wearerId, 'deepseek')).toBe('ok');
    const payloads = [
      { baselineCandidate: { contexts: { resting: {}, activity: {}, night: {} }, confidence: 'medium', observations: [], evidenceRefs: ['cycle-1'] }, updatedLongTermSummaryCandidate: null },
      { decision: 'observe', reason: '短时观察' },
      { wearerPrompt: '请确认您是否不舒服。' },
    ];
    const calls: string[] = [];
    const fetcher = async (_url: string, init: RequestInit) => { calls.push((init.headers as Record<string, string>).Authorization ?? ''); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payloads.shift()) } }] }), { status: 200 }); };
    const providers = demoProviders(sessions, { apiKey: 'private-test-key', fetcher: fetcher as typeof fetch });
    const baseline: BaselineGenerationRequest = { wearerId, cycleId: 'cycle-1', cycleStart: '2026-10-01T00:00:00Z', cycleEnd: '2026-10-14T23:59:59Z', validDays: 10, observations: [], recentBaselines: [], longTermSummary: null, evidenceWeights: { current: 1, recent: 0, longTerm: 0 }, allowedRanges: {}, evidenceRefs: ['cycle-1'] };
    expect((await providers.baseline.generateCandidate(baseline)).baselineCandidate.confidence).toBe('medium');
    expect((await providers.review.review({ wearerId, risk: { level: 'abnormal', reasons: [], assessedAt: '2026-11-05T00:00:00Z' }, latest: { timestamp: '2026-11-05T00:00:00Z', activity: 'resting', heartRate: 110 }, recent: [], baselineVersion: 1, baseline: {} })).decision).toBe('observe');
    const event = { wearerId, state: 'wearer_alert', risk: { level: 'abnormal', reasons: ['heart_rate_persistent'], assessedAt: '2026-11-05T00:00:00Z' }, location: null } as EmergencyEvent;
    expect((await providers.message.compose({ event, fallback: { wearerPrompt: '请确认' } })).wearerPrompt).toContain('不舒服');
    expect(calls).toEqual(['Bearer private-test-key', 'Bearer private-test-key', 'Bearer private-test-key']);
    expect(sessions.status(wearerId).remaining).toBe(2);
  } finally { db.close(); }
});

it('serves the built page and assets on the same protected port', async () => {
  const { db, app, sessions } = setup();
  const root = await mkdtemp(join(tmpdir(), 'anmai-web-'));
  try {
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'index.html'), '<html>安脉</html>');
    await writeFile(join(root, 'assets', 'app.js'), 'window.anmai=true');
    serveWeb(app, root, sessions);
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(401);
    const cookie = (await app.inject({ method: 'GET', url: `/join/${token}` })).headers['set-cookie'] as string;
    expect((await app.inject({ method: 'GET', url: '/', headers: { cookie } })).body).toContain('安脉');
    expect((await app.inject({ method: 'GET', url: '/assets/app.js', headers: { cookie } })).body).toContain('anmai=true');
  } finally { await app.close(); db.close(); await rm(root, { recursive: true, force: true }); }
});

it('invalidates old browser cookies when the public link token rotates', () => {
  const db = openDatabase(':memory:');
  try {
    const first = new DemoSessions(db, token, true);
    const cookie = `anmai_session=${first.create().id}`;
    expect(first.fromCookie(cookie)).not.toBeNull();
    const rotated = new DemoSessions(db, `${token}-rotated`, true);
    expect(rotated.fromCookie(cookie)).toBeNull();
  } finally { db.close(); }
});
