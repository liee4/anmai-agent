import { join } from 'node:path';
import { openDatabase } from './infra/database.js';
import { SystemClock } from './clock.js';
import { buildApp } from './app.js';
import { createBaselineProvider } from './features/baseline/provider-registry.js';
import { createRiskReviewProvider } from './features/monitoring/risk-review-registry.js';
import { createMessageProvider } from './features/agent/message-registry.js';
import { DemoSessions } from './features/demo/demo-session.js';
import { demoProviders } from './features/demo/demo-providers.js';
import { serveWeb } from './serve-web.js';

const db = openDatabase(process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'anmai.sqlite'));
if (process.env.PUBLIC_DEMO === '1' && !process.env.DEMO_ACCESS_TOKEN) throw new Error('DEMO_ACCESS_TOKEN is required for public demo');
const sessions = process.env.PUBLIC_DEMO === '1' ? new DemoSessions(db, process.env.DEMO_ACCESS_TOKEN!, Boolean(process.env.DEEPSEEK_API_KEY), Number(process.env.DEMO_DEEPSEEK_SESSION_LIMIT ?? 20), Number(process.env.DEMO_DEEPSEEK_GLOBAL_LIMIT ?? 100)) : undefined;
const providers = sessions ? demoProviders(sessions, { apiKey: process.env.DEEPSEEK_API_KEY, baseUrl: process.env.DEEPSEEK_BASE_URL, model: process.env.DEEPSEEK_MODEL }) : null;
const configuredProvider = providers ? { provider: providers.baseline, name: providers.nameFor } : createBaselineProvider();
const configuredRiskReview = providers ? { provider: providers.review, name: providers.nameFor } : createRiskReviewProvider();
const configuredMessages = providers ? { provider: providers.message, name: providers.nameFor } : createMessageProvider();
const app = buildApp({ db, clock: new SystemClock(), baselineProvider: configuredProvider.provider, baselineProviderName: configuredProvider.name, riskReviewProvider: configuredRiskReview.provider, riskReviewProviderName: configuredRiskReview.name, riskObservationSeconds: Number(process.env.RISK_OBSERVATION_SECONDS ?? 30), messageProvider: configuredMessages.provider, messageProviderName: configuredMessages.name, ...(providers ? { wearerTextProvider: providers.wearerText, wearerTextProviderName: providers.nameFor } : {}), ...(sessions ? { demoSessions: sessions } : {}) });
serveWeb(app, join(process.cwd(), 'apps', 'web', 'dist'), sessions);
const interval = setInterval(async () => { await app.inject({ method: 'POST', url: '/api/deadlines/run', headers: sessions ? { 'x-demo-internal': sessions.internalToken } : {} }); }, 1000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => { clearInterval(interval); await app.close(); db.close(); process.exit(0); });
}

await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.PUBLIC_DEMO === '1' ? '0.0.0.0' : '127.0.0.1' });
app.log.info('Anmai API ready (simulation only)');
