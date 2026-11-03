import type { DailySummary } from '@anmai/contracts';
import type { NormalizedSample } from './normalizer.js';

export function buildDailySummary(wearerId: string, date: string, samples: NormalizedSample[], learningPaused = false): DailySummary {
  const minutes = new Set(samples.map(sample => sample.minute));
  const trusted = samples.filter(sample => sample.deviceTrusted !== false && sample.heartRate !== undefined && sample.spo2 !== undefined && sample.activity !== 'unknown');
  const restingMinutes = new Set(trusted.filter(sample => sample.activity === 'resting').map(sample => sample.minute));
  const qualityRate = trusted.length / samples.length;
  const coverageHours = minutes.size / 60;
  const restingHours = restingMinutes.size / 60;
  const baselineEligible = !learningPaused && coverageHours >= 8 && qualityRate >= 0.8 && restingHours >= 2;
  return { wearerId, date, coverageHours, qualityRate, restingHours, baselineEligible, exclusionReasons: learningPaused ? ['baseline_paused'] : baselineEligible ? [] : ['insufficient_coverage'] };
}
