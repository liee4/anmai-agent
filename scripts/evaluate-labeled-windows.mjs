import { readFileSync } from 'node:fs';
import { evaluateWindows } from '../apps/api/dist/features/validation/offline-evaluator.js';

if (process.argv.length !== 3) {
  process.stderr.write('Usage: pnpm eval:windows <local-windows.json>\n');
  process.exitCode = 2;
} else {
  try {
    const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(`${JSON.stringify(evaluateWindows(input), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
