import { join } from 'node:path';
import { openDatabase } from './infra/database.js';
import { SystemClock } from './clock.js';
import { buildApp } from './app.js';
import { createBaselineProvider } from './features/baseline/provider-registry.js';

const db = openDatabase(process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'anmai.sqlite'));
const configuredProvider = createBaselineProvider();
const app = buildApp({ db, clock: new SystemClock(), baselineProvider: configuredProvider.provider, baselineProviderName: configuredProvider.name });
const interval = setInterval(async () => { await app.inject({ method: 'POST', url: '/api/deadlines/run' }); }, 1000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => { clearInterval(interval); await app.close(); db.close(); process.exit(0); });
}

await app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' });
app.log.info('Anmai API ready (simulation only)');
