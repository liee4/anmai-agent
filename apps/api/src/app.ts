import Fastify, { type FastifyInstance } from 'fastify';
import { parseIngestRequest, TimerSettingsSchema, type VitalSample } from '@anmai/contracts';
import { Value } from '@sinclair/typebox/value';
import type { Clock } from './clock.js';
import type { DatabaseContext } from './infra/database.js';
import { IngestionService } from './features/ingestion/ingestion-service.js';
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
import { BaselineExclusionRepository } from './infra/repositories/baseline-exclusion-repository.js';
import { DailySummaryRepository } from './infra/repositories/daily-summary-repository.js';
import { nextDemoHistory } from './features/simulator/demo-history.js';

export interface AppDependencies { db: DatabaseContext; clock: Clock; baselineProvider?: BaselineModelProvider; baselineProviderName?: string }

export function buildApp({ db, clock, baselineProvider = new FakeBaselineProvider(), baselineProviderName = 'fake' }: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });
  const ingest = new IngestionService(db);
  const detector = new RiskDetector();
  const emergency = new EmergencyService(db, clock);
  const baseline = new BaselineService(db, baselineProvider, baselineProviderName);
  const agent = new AnmaiAgent(detector, emergency);
  const latestRisk = new Map<string, RiskAssessment>();
  const bus = new EventBus();
  const exclusions = new BaselineExclusionRepository(db);

  function snapshot(wearerId: string) {
    return { wearerId, risk: latestRisk.get(wearerId) ?? null, event: emergency.getActiveForWearer(wearerId), confirmedMonitor: emergency.getMonitorState(wearerId), baseline: baseline.getActive(wearerId), baselineState: baseline.getState(wearerId), provider: baselineProviderName };
  }

  function sse(event: BusEvent): string { return `id: ${event.id}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`; }
  function visibleTo(event: BusEvent, wearerId: string): boolean { return event.type === 'deadline' || (event.data as { wearerId?: string }).wearerId === wearerId; }

  async function evaluate(wearerId: string, samples: VitalSample[]) {
    const activeBaseline = baseline.getActive(wearerId);
    const run = await agent.handle({ kind: 'vitals', wearerId, samples, baselineVersion: activeBaseline?.version ?? null, ...(activeBaseline ? { baseline: activeBaseline.baseline as PersonalBaseline } : {}) });
    const risk = run.risk!;
    if ((risk.level === 'abnormal' || risk.level === 'worsening') && samples.length > 0) {
      const timestamps = samples.map(sample => new Date(sample.timestamp).toISOString()).sort();
      exclusions.excludeRange(wearerId, timestamps[0]!, timestamps[timestamps.length - 1]!, `risk_${risk.level}`);
    }
    latestRisk.set(wearerId, risk);
    bus.publish('monitoring', { wearerId, risk, event: run.event });
    return { risk, event: run.event, trace: run.trace };
  }

  app.get('/api/health', async () => ({ status: 'ok', demoOnly: true }));
  app.get('/api/settings/timers', async () => emergency.getSettings());
  app.put('/api/settings/timers', async (request, reply) => {
    if (!Value.Check(TimerSettingsSchema, request.body)) return reply.code(400).send({ code: 'INVALID_TIMERS', message: 'Four positive integer timer values are required' });
    if (!emergency.setSettings(request.body)) return reply.code(409).send({ code: 'ACTIVE_EVENT', message: 'Timer settings are locked during an active event' });
    return emergency.getSettings();
  });
  app.post('/api/ingest', async (request, reply) => {
    try {
      const input = parseIngestRequest(request.body);
      const result = ingest.ingest(input);
      const generated = await baseline.generatePending(input.wearerId);
      bus.publish('ingestion', { wearerId: input.wearerId, result, generated });
      return { ...result, ...generated };
    }
    catch (error) { return reply.code(400).send({ code: 'INVALID_INGEST', message: error instanceof Error ? error.message : String(error) }); }
  });
  app.get('/api/baselines/:wearerId', async (request) => {
    const { wearerId } = request.params as { wearerId: string };
    return { state: baseline.getState(wearerId), active: baseline.getActive(wearerId), provider: baselineProviderName };
  });
  app.post('/api/baselines/:wearerId/generate', async (request) => {
    const { wearerId } = request.params as { wearerId: string };
    return baseline.generatePending(wearerId);
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
  app.post('/api/simulator/:scenario', async (request, reply) => {
    const { scenario } = request.params as { scenario: Scenario };
    const body = request.body as { wearerId?: string };
    if (!scenarios.includes(scenario) || !body?.wearerId) return reply.code(400).send({ code: 'INVALID_SCENARIO', message: 'Known scenario and wearerId are required' });
    return evaluate(body.wearerId, scenarioSamples(scenario, clock.now()));
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
  app.post('/api/events/:eventId/actions', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const body = request.body as { stateVersion?: number; kind?: EmergencyCommand['kind'] };
    if (!Number.isInteger(body?.stateVersion) || !['wearer_unwell', 'wearer_safe', 'relative_takeover', 'relative_decline', 'worsening', 'normal_60s', 'close'].includes(body?.kind ?? '')) return reply.code(400).send({ code: 'INVALID_ACTION', message: 'Valid stateVersion and kind are required' });
    const result = await agent.handle({ kind: 'response', eventId, stateVersion: body.stateVersion!, command: { kind: body.kind! } });
    if (result.ok && result.event) bus.publish('event', { wearerId: result.event.wearerId, event: result.event });
    return reply.code(result.ok ? 200 : 409).send({ ok: result.ok, event: result.event, trace: result.trace });
  });
  app.post('/api/deadlines/run', async () => {
    const executed = (await agent.handle({ kind: 'deadline' })).executed;
    if (executed) bus.publish('deadline', { executed });
    return { executed };
  });
  return app;
}
