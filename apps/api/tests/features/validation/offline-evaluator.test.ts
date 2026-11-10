import { expect, it } from 'vitest';
import { evaluateWindows } from '../../../src/features/validation/offline-evaluator.js';
import { scenarioSamples } from '../../../src/features/simulator/scenarios.js';

const time = new Date('2026-11-10T10:00:00Z');

it('counts labeled windows separately from unlabelled public replay and handles empty denominators', () => {
  const result = evaluateWindows([
    { id: 'synthetic-positive', reference: 'event', samples: scenarioSamples('worsening', time) },
    { id: 'synthetic-negative', reference: 'no_event', samples: scenarioSamples('normal', time) },
    { id: 'unlabelled-record', reference: 'unlabelled', samples: scenarioSamples('normal', time) },
  ]);
  expect(result.counts).toEqual({ truePositive: 1, falseNegative: 0, falsePositive: 0, trueNegative: 1, unlabelled: 1 });
  expect(result.metrics).toEqual({ sensitivity: 1, specificity: 1 });
  expect(result.windows.map(item => item.riskLevel)).toEqual(['worsening', 'normal', 'normal']);
  expect(evaluateWindows([{ id: 'only-unlabelled', reference: 'unlabelled', samples: scenarioSamples('normal', time) }]).metrics).toEqual({ sensitivity: null, specificity: null });
});

it('rejects duplicate IDs, empty measurements and invalid reference labels', () => {
  const valid = { id: 'a', reference: 'no_event', samples: scenarioSamples('normal', time) };
  expect(() => evaluateWindows([valid, valid])).toThrow(/duplicate/i);
  expect(() => evaluateWindows([{ ...valid, samples: [] }])).toThrow(/samples/i);
  expect(() => evaluateWindows([{ ...valid, reference: 'maybe' }])).toThrow(/reference/i);
});
