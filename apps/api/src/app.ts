import Fastify, { type FastifyInstance } from 'fastify';
import { parseIngestRequest, TimerSettingsSchema, type VitalSample } from '@anmai/contracts';
import { Value } from '@sinclair/typebox/value';
import type { Clock } from './clock.js';
import type { DatabaseContext } from './infra/database.js';
import { IngestionService } from './features/ingestion/ingestion-service.js';
import { SamplePipeline, type SampleSource } from './features/ingestion/sample-pipeline.js';
import { normalizeInput } from './features/ingestion/normalizer.js';
import { RiskDetector, type PersonalBaseline } from './features/monitoring/risk-detector.js';
import { EmergencyService } from './features/emergency/emergency-service.js';
import type { EmergencyCommand } from './features/emergency/state-machine.js';
import { BaselineService } from './features/baseline/baseline-service.js';
import type { BaselineModelProvider } from './features/baseline/baseline-model-provider.js';
import { FakeBaselineProvider } from './features/baseline/fake-baseline-provider.js';
import { scenarioSamples, scenarios, type Scenario } from './features/simulator/scenarios.js';
import type { RiskAssessment } from '@anmai/contracts';
import { AnmaiAgent } from './features/agent/anmai-agent.js';
import { EventBus, type BusEvent } from './infra/event-bus.js';
import { DailySummaryRepository } from './infra/repositories/daily-summary-repository.js';
import { nextDemoHistory } from './features/simulator/demo-history.js';
import { resetDemoWearer } from './features/simulator/demo-reset.js';
import { RiskReviewService } from './features/monitoring/risk-review-service.js';
import { FakeRiskReviewProvider } from './features/monitoring/fake-risk-review-provider.js';
import type { RiskReviewProvider } from './features/monitoring/risk-review-provider.js';
import { EventCardService } from './features/emergency/event-card-service.js';
import { MessageService } from './features/agent/message-service.js';
import { FakeMessageProvider } from './features/agent/fake-message-provider.js';
import type { MessageProvider } from './features/agent/message-provider.js';
import type { DemoSessions } from './features/demo/demo-session.js';

export interface AppDependencies { db: DatabaseContext; clock: Clock; baselineProvider?: BaselineModelProvider; baselineProviderName?: string | ((wearerId: string) => string); riskReviewProvider?: RiskReviewProvider; riskReviewProviderName?: string | ((wearerId: string) => string); riskObservationSeconds?: number; messageProvider?: MessageProvider; messageProviderName?: string | ((wearerId: string) => string); demoSessions?: DemoSessions }

export function buildApp({ db, clock, baselineProvider = new FakeBaselineProvider(), baselineProviderName = 'fake', riskReviewProvider = new FakeRiskReviewProvider(), riskReviewProviderName = 'fake', riskObservationSeconds = 30, messageProvider = new FakeMessageProvider(), messageProviderName = 'fake', demoSessions }: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });
  const pipeline = new SamplePipeline(db);
  const ingest = new IngestionService(db, pipeline);
  const detector = new RiskDetector();
  const emergency = new EmergencyService(db, clock);
  const baseline = new BaselineService(db, baselineProvider, baselineProviderName);
  const riskReview = new RiskReviewService(db, clock, riskReviewProvider, riskReviewProviderName, riskObservationSeconds);
  const agent = new AnmaiAgent(detector, emergency, riskReview);
  const cards = new EventCardService(db);
  const messages = new MessageService(db, clock, messageProvider, messageProviderName);
  const latestRisk = new Map<string, RiskAssessment>();
  const bus = new EventBus();
  const nameOf = (name: string | ((wearerId: string) => string), wearerId: string) => typeof name === 'function' ? name(wearerId) : name;

  if (demoSessions?.accessToken) {
    app.get('/join/:token', async (request, reply) => {
      if (!demoSessions.verifyToken((request.params as { token: string }).token)) return reply.code(403).send('无效演示链接');
      const session = demoSessions.fromCookie(request.headers.cookie) ?? demoSessions.create();
      return reply.header('Set-Cookie', `anmai_session=${session.id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`).header('Referrer-Policy', 'no-referrer').redirect('/');
    });
    app.addHook('preHandler', async (request, reply) => {
      if (!request.url.startsWith('/api/') || request.url.startsWith('/api/health')) return;
      if (request.url.startsWith('/api/deadlines/run')) {
        if (request.headers['x-demo-internal'] === demoSessions.internalToken) return;
        return reply.code(403).send({ code: 'INTERNAL_ONLY' });
      }
      const session = demoSessions.fromCookie(request.headers.cookie);
      if (!session) return reply.code(401).send({ code: 'DEMO_SESSION_REQUIRED', message: '请使用评委演示链接进入' });
      const wearerIds = [(request.params as { wearerId?: string })?.wearerId, (request.query as { wearerId?: string })?.wearerId, (request.body as { wearerId?: string } | null)?.wearerId].filter(Boolean);
      if (wearerIds.some(id => id !== session.wearer_id)) return reply.code(403).send({ code: 'SESSION_MISMATCH', message: '此数据属于其他演示会话' });
      const eventId = (request.params as { eventId?: string })?.eventId;
      if (eventId && emergency.get(eventId)?.wearerId !== session.wearer_id) return reply.code(403).send({ code: 'SESSION_MISMATCH', message: '此事件属于其他演示会话' });
    });
  }

  function snapshot(wearerId: string) {
    const event = emergency.getActiveForWearer(wearerId);
    const activeBaseline = baseline.getActive(wearerId);
    return { wearerId, risk: latestRisk.get(wearerId) ?? riskReview.getLastObservation(wearerId)?.risk ?? null, event, eventCard: event ? cards.get(event.eventId) : null, contactDeliveries: event ? emergency.getContactDeliveries(event.eventId) : [], messages: event ? messages.get(event.eventId, event.state) : null, confirmedMonitor: emergency.getMonitorState(wearerId), baseline: activeBaseline, aggregationWarning: Boolean(activeBaseline && activeBaseline.baseline.aggregationVersion !== 2), baselineState: baseline.getState(wearerId), provider: nameOf(baselineProviderName, wearerId), riskReview: riskReview.get(wearerId), riskReviewProvider: nameOf(riskReviewProviderName, wearerId), messageProvider: nameOf(messageProviderName, wearerId) };
  }

  function sse(event: BusEvent): string { return `id: ${event.id}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`; }
  function visibleTo(event: BusEvent, wearerId: string): boolean { return event.type === 'deadline' || (event.data as { wearerId?: string }).wearerId === wearerId; }

  async function evaluate(wearerId: string, samples: VitalSample[], source: SampleSource = 'live') {
    if (samples.length > 0 && source === 'live') pipeline.store(wearerId, normalizeInput({ wearerId, inputMode: 'auto', data: samples }).samples, source);
    const activeBaseline = baseline.getActive(wearerId);
    const run = await agent.handle({ kind: 'vitals', wearerId, samples, baselineVersion: activeBaseline?.version ?? null, ...(activeBaseline ? { baseline: activeBaseline.baseline as PersonalBaseline } : {}) });
    const risk = run.risk!;
    if (run.event) {
      cards.record(run.event.eventId, samples);
      void messages.ensure(run.event).then(() => bus.publish('event', { wearerId, event: run.event })).catch(() => undefined);
    }
    if ((risk.level === 'abnormal' || risk.level === 'worsening') && samples.length > 0) {
      pipeline.auditRisk(wearerId, samples, source, risk);
      if (run.event) pipeline.recordAnomaly(run.event.eventId, samples);
    }
    latestRisk.set(wearerId, risk);
    bus.publish('monitoring', { wearerId, risk, event: run.event });
    return { risk, event: run.event, trace: run.trace };
  }

  app.get('/api/health', async () => ({ status: 'ok', demoOnly: true }));
  app.get('/api/session', async request => ({ wearerId: demoSessions?.fromCookie(request.headers.cookie)?.wearer_id ?? 'demo-wearer', publicDemo: Boolean(demoSessions?.accessToken), ...(demoSessions?.accessToken ? demoSessions.status(demoSessions.fromCookie(request.headers.cookie)!.wearer_id) : { mode: 'fake', deepseekConfigured: false, remaining: 0 }) }));
  app.get('/api/settings/provider-mode', async request => demoSessions?.status(demoSessions.fromCookie(request.headers.cookie)!.wearer_id) ?? { mode: 'fake', deepseekConfigured: false, remaining: 0 });
  app.put('/api/settings/provider-mode', async (request, reply) => {
    if (!demoSessions?.accessToken) return reply.code(409).send({ code: 'PUBLIC_DEMO_REQUIRED', message: '模型切换仅在公开演示模式启用' });
    const mode = (request.body as { mode?: string } | null)?.mode;
    if (mode !== 'fake' && mode !== 'deepseek') return reply.code(400).send({ code: 'INVALID_MODE', message: '请选择 Fake 或 DeepSeek' });
    const wearerId = demoSessions.fromCookie(request.headers.cookie)!.wearer_id;
    const result = demoSessions.switch(wearerId, mode);
    if (result !== 'ok') return reply.code(409).send({ code: result, message: result === 'missing_key' ? '后端尚未配置 DeepSeek API Key' : result === 'quota' ? '本会话 DeepSeek 演示额度已用完' : '当前流程仍在进行，请结束后再切换' });
    return demoSessions.status(wearerId);
  });
  app.get('/api/settings/timers', async () => emergency.getSettings());
  app.get('/api/settings/risk-review', async () => riskReview.getSettings());
  app.put('/api/settings/risk-review', async (request, reply) => {
    const body = request.body as { observationSeconds?: number } | null;
    if (!Number.isInteger(body?.observationSeconds) || body!.observationSeconds! < 1 || body!.observationSeconds! > 3600) return reply.code(400).send({ code: 'INVALID_REVIEW_TIMER', message: '观察秒数须为 1 至 3600 的整数' });
    if (!riskReview.setObservationSeconds(body!.observationSeconds!)) return reply.code(409).send({ code: 'ACTIVE_REVIEW', message: '正在观察，不能修改本次倒计时' });
    return riskReview.getSettings();
  });
  app.put('/api/settings/timers', async (request, reply) => {
    if (!Value.Check(TimerSettingsSchema, request.body)) return reply.code(400).send({ code: 'INVALID_TIMERS', message: 'Four positive integer timer values are required' });
    if (!emergency.setSettings(request.body)) return reply.code(409).send({ code: 'ACTIVE_EVENT', message: 'Timer settings are locked during an active event' });
    return emergency.getSettings();
  });
  app.post('/api/ingest', async (request, reply) => {
    try {
      const input = parseIngestRequest(request.body);
      const result = ingest.ingest(input);
      const leave = demoSessions?.enter(input.wearerId);
      let generated;
      try { generated = await baseline.generatePending(input.wearerId); } finally { leave?.(); }
      bus.publish('ingestion', { wearerId: input.wearerId, result, generated });
      return { ...result, ...generated };
    }
    catch (error) { return reply.code(400).send({ code: 'INVALID_INGEST', message: error instanceof Error ? error.message : String(error) }); }
  });
  app.get('/api/baselines/:wearerId', async (request) => {
    const { wearerId } = request.params as { wearerId: string };
    return { state: baseline.getState(wearerId), active: baseline.getActive(wearerId), provider: nameOf(baselineProviderName, wearerId) };
  });
  app.post('/api/baselines/:wearerId/generate', async (request) => {
    const { wearerId } = request.params as { wearerId: string };
    const leave = demoSessions?.enter(wearerId);
    try { return await baseline.generatePending(wearerId); } finally { leave?.(); }
  });
  app.post('/api/baselines/:wearerId/resume', async (request, reply) => {
    const { wearerId } = request.params as { wearerId: string };
    const resumed = baseline.resume(wearerId);
    if (resumed) bus.publish('baseline_resumed', { wearerId });
    return reply.code(resumed ? 200 : 409).send({ resumed, state: baseline.getState(wearerId) });
  });
  app.post('/api/monitor/evaluate', async (request, reply) => {
    const body = request.body as { wearerId?: string; samples?: VitalSample[] };
    if (!body || typeof body.wearerId !== 'string' || !Array.isArray(body.samples)) return reply.code(400).send({ code: 'INVALID_MONITOR_INPUT', message: 'wearerId and samples are required' });
    return evaluate(body.wearerId, body.samples);
  });
  app.post('/api/monitor/help', async (request, reply) => {
    const body = request.body as { wearerId?: string } | null;
    if (!body?.wearerId) return reply.code(400).send({ code: 'WEARER_REQUIRED' });
    const existing = emergency.getActiveForWearer(body.wearerId);
    if (existing) return { event: existing };
    const observation = riskReview.getLastObservation(body.wearerId);
    if (!observation || !['observe', 'pending'].includes(riskReview.get(body.wearerId)?.status ?? '') || observation.risk.level !== 'abnormal') return reply.code(409).send({ code: 'NO_ACTIVE_OBSERVATION', message: '当前没有可接管的观察过程' });
    riskReview.cancel(body.wearerId);
    const activeBaseline = baseline.getActive(body.wearerId);
    const alert = emergency.start(body.wearerId, observation.risk, activeBaseline?.version ?? null, observation.sample.location, activeBaseline?.baseline as PersonalBaseline ?? {});
    const contacted = emergency.act(alert.eventId, alert.stateVersion, { kind: 'wearer_unwell' }).event!;
    cards.record(contacted.eventId, [observation.sample]);
    void messages.ensure(contacted).catch(() => undefined);
    bus.publish('event', { wearerId: body.wearerId, event: contacted });
    return { event: contacted };
  });
  app.post('/api/simulator/reset', async (request, reply) => {
    const body = request.body as { wearerId?: string; confirmation?: string } | null;
    if (!body?.wearerId || (demoSessions?.accessToken ? !demoSessions.forWearer(body.wearerId) : body.wearerId !== 'demo-wearer') || body.confirmation !== 'RESET_DEMO_DATA') {
      return reply.code(400).send({ code: 'INVALID_DEMO_RESET', message: 'Demo wearer and confirmation are required' });
    }
    baseline.cancelPending(body.wearerId);
    resetDemoWearer(db, body.wearerId);
    latestRisk.delete(body.wearerId);
    bus.publish('demo_reset', { wearerId: body.wearerId });
    return { reset: true };
  });
  app.post('/api/simulator/:scenario', async (request, reply) => {
    const { scenario } = request.params as { scenario: Scenario };
    const body = request.body as { wearerId?: string };
    if (!scenarios.includes(scenario) || !body?.wearerId) return reply.code(400).send({ code: 'INVALID_SCENARIO', message: 'Known scenario and wearerId are required' });
    return evaluate(body.wearerId, scenarioSamples(scenario, clock.now()), 'scenario');
  });
  app.get('/api/simulator/history/next', async (request, reply) => {
    const { wearerId } = request.query as { wearerId?: string };
    if (!wearerId) return reply.code(400).send({ code: 'WEARER_REQUIRED', message: 'wearerId is required' });
    const dates = new DailySummaryRepository(db).list(wearerId).map(day => day.date);
    return reply.header('Cache-Control', 'no-store').send(nextDemoHistory(wearerId, dates));
  });
  app.get('/api/dashboard/:wearerId', async (request) => {
    const { wearerId } = request.params as { wearerId: string };
    return snapshot(wearerId);
  });
  app.get('/api/events/stream', async (request, reply) => {
    const query = request.query as { wearerId?: string };
    if (!query.wearerId) return reply.code(400).send({ code: 'WEARER_REQUIRED', message: 'wearerId is required' });
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(snapshot(query.wearerId))}\n\n`);
    const after = Number(request.headers['last-event-id'] ?? 0);
    if (Number.isFinite(after) && after > 0) for (const event of bus.since(after)) if (visibleTo(event, query.wearerId!)) reply.raw.write(sse(event));
    const unsubscribe = bus.subscribe(event => { if (visibleTo(event, query.wearerId!)) reply.raw.write(sse(event)); });
    const keepalive = setInterval(() => reply.raw.write(': keepalive\n\n'), 20_000);
    request.raw.on('close', () => { clearInterval(keepalive); unsubscribe(); });
  });
  app.get('/api/events/:eventId', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const event = emergency.get(eventId);
    return event ?? reply.code(404).send({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
  });
  app.get('/api/events/:eventId/timeline', async (request) => emergency.getTimeline((request.params as { eventId: string }).eventId));
  app.get('/api/events/:eventId/card', async (request, reply) => cards.get((request.params as { eventId: string }).eventId) ?? reply.code(404).send({ code: 'EVENT_NOT_FOUND' }));
  app.get('/api/events/:eventId/contacts', async (request) => emergency.getContactDeliveries((request.params as { eventId: string }).eventId));
  app.post('/api/events/:eventId/contacts/:contactId/actions', async (request, reply) => {
    const { eventId, contactId } = request.params as { eventId: string; contactId: string };
    const body = request.body as { stateVersion?: number; kind?: string } | null;
    if (!Number.isInteger(body?.stateVersion) || !['takeover', 'decline'].includes(body?.kind ?? '')) return reply.code(400).send({ code: 'INVALID_CONTACT_ACTION' });
    const result = emergency.respondContact(eventId, body!.stateVersion!, contactId, body!.kind as 'takeover' | 'decline');
    if (result.ok && result.event) { bus.publish('event', { wearerId: result.event.wearerId, event: result.event }); void messages.ensure(result.event).catch(() => undefined); }
    return reply.code(result.ok ? 200 : 409).send(result);
  });
  app.post('/api/events/:eventId/actions', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const body = request.body as { stateVersion?: number; kind?: EmergencyCommand['kind'] };
    if (!Number.isInteger(body?.stateVersion) || !['wearer_unwell', 'wearer_safe', 'relative_takeover', 'relative_decline', 'worsening', 'normal_60s', 'close'].includes(body?.kind ?? '')) return reply.code(400).send({ code: 'INVALID_ACTION', message: 'Valid stateVersion and kind are required' });
    const result = await agent.handle({ kind: 'response', eventId, stateVersion: body.stateVersion!, command: { kind: body.kind! } });
    if (result.ok && result.event) { bus.publish('event', { wearerId: result.event.wearerId, event: result.event }); void messages.ensure(result.event).catch(() => undefined); }
    return reply.code(result.ok ? 200 : 409).send({ ok: result.ok, event: result.event, trace: result.trace });
  });
  app.post('/api/deadlines/run', async () => {
    const executed = (await agent.handle({ kind: 'deadline' })).executed;
    if (executed) bus.publish('deadline', { executed });
    if (executed) for (const row of db.raw.prepare('SELECT event_id FROM emergency_events WHERE closed_at IS NULL').all() as { event_id: string }[]) {
      const event = emergency.get(row.event_id);
      if (event) void messages.ensure(event).catch(() => undefined);
    }
    return { executed };
  });
  return app;
}
