import { Value } from '@sinclair/typebox/value';
import { VitalSampleSchema, type VitalSample } from '@anmai/contracts';
import { RiskDetector, type PersonalBaseline } from '../monitoring/risk-detector.js';

export interface EvaluationWindow {
  id: string;
  reference: 'event' | 'no_event' | 'unlabelled';
  samples: VitalSample[];
  baseline?: PersonalBaseline;
}

export interface EvaluationReport {
  calibrationStatus: 'not_clinically_calibrated';
  counts: { truePositive: number; falseNegative: number; falsePositive: number; trueNegative: number; unlabelled: number };
  metrics: { sensitivity: number | null; specificity: number | null };
  windows: { id: string; reference: EvaluationWindow['reference']; riskLevel: string }[];
}

export function evaluateWindows(input: unknown): EvaluationReport {
  if (!Array.isArray(input)) throw new Error('Evaluation windows must be an array');
  const ids = new Set<string>();
  const counts = { truePositive: 0, falseNegative: 0, falsePositive: 0, trueNegative: 0, unlabelled: 0 };
  const detector = new RiskDetector();
  const windows = input.map((raw): EvaluationReport['windows'][number] => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid evaluation window');
    const item = raw as Partial<EvaluationWindow>;
    if (typeof item.id !== 'string' || !item.id.trim()) throw new Error('Invalid window id');
    if (ids.has(item.id)) throw new Error(`Duplicate window id: ${item.id}`);
    ids.add(item.id);
    if (item.reference !== 'event' && item.reference !== 'no_event' && item.reference !== 'unlabelled') throw new Error(`Invalid reference for ${item.id}`);
    if (!Array.isArray(item.samples) || !item.samples.length) throw new Error(`Invalid samples for ${item.id}`);
    if (item.samples.some(sample => !Value.Check(VitalSampleSchema, sample) || !Number.isFinite(Date.parse(sample.timestamp)))) throw new Error(`Invalid samples for ${item.id}`);
    const risk = detector.evaluate(item.samples, item.baseline ?? {});
    const alert = risk.level === 'abnormal' || risk.level === 'worsening';
    if (item.reference === 'unlabelled') counts.unlabelled++;
    else if (item.reference === 'event') counts[alert ? 'truePositive' : 'falseNegative']++;
    else counts[alert ? 'falsePositive' : 'trueNegative']++;
    return { id: item.id, reference: item.reference, riskLevel: risk.level };
  });
  const positives = counts.truePositive + counts.falseNegative;
  const negatives = counts.trueNegative + counts.falsePositive;
  return { calibrationStatus: 'not_clinically_calibrated', counts, metrics: { sensitivity: positives ? counts.truePositive / positives : null, specificity: negatives ? counts.trueNegative / negatives : null }, windows };
}
