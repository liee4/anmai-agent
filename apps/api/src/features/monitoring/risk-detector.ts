import type { RiskAssessment, VitalSample } from '@anmai/contracts';
import { demoThresholds } from './detection-config.js';
import { median } from './sliding-window.js';
import { secondVitals } from './second-window.js';

type Context = 'resting' | 'activity' | 'night';
interface Metric { median: number; mad: number }
interface Observation { context: Context; heartRate?: Metric; spo2?: Metric }
export interface PersonalBaseline { values?: Record<string, number>; observations?: Observation[] }

function usable(sample: VitalSample): boolean {
  return sample.deviceTrusted !== false && sample.activity !== 'unknown' &&
    sample.heartRate !== undefined && sample.heartRate >= 30 && sample.heartRate <= 240 &&
    sample.spo2 !== undefined && sample.spo2 >= 70 && sample.spo2 <= 100 &&
    (sample.systolicBP === undefined || sample.diastolicBP === undefined || sample.systolicBP > sample.diastolicBP);
}
function deviation(value: number, metric: Metric | undefined, scale: number): number {
  return metric ? Math.abs(value - metric.median) / Math.max(1.4826 * metric.mad, scale) : 0;
}

export class RiskDetector {
  evaluate(samples: VitalSample[], baseline: PersonalBaseline = {}): RiskAssessment {
    const ordered = [...samples].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const latest = ordered.at(-1);
    const assessedAt = latest?.timestamp ?? new Date(0).toISOString();
    if (!latest || !usable(latest) || ordered.slice(-10).some(sample => !usable(sample))) return { level: 'untrusted_data', score: 0, reasons: ['device_untrusted_or_invalid'], assessedAt };

    const latestMs = Date.parse(latest.timestamp);
    const seconds = secondVitals(ordered, usable);
    const latestSecond = Math.floor(latestMs / 1000) * 1000;
    const stable = seconds.filter(sample => latestSecond - sample.at < 10_000);
    if (stable.length < 5 || stable.some((sample, index) => index > 0 && sample.at - stable[index - 1]!.at > demoThresholds.maxRecentGapSeconds * 1000)) return { level: 'untrusted_data', score: 0, reasons: ['insufficient_recent_samples'], assessedAt };
    const heartRate = median(stable.map(sample => sample.heartRate))!;
    const spo2 = median(stable.map(sample => sample.spo2))!;
    const freshBP = ordered.filter(sample => latestMs - Date.parse(sample.timestamp) <= 30 * 60_000 && sample.systolicBP !== undefined && sample.diastolicBP !== undefined && usable(sample));
    const lastBP = freshBP.at(-1);
    const fixedReasons = [heartRate > demoThresholds.heartRateUpper && 'fixed_heart_rate_high', heartRate < demoThresholds.heartRateLower && 'fixed_heart_rate_low', spo2 < demoThresholds.spo2Lower && 'fixed_spo2_low', lastBP && lastBP.systolicBP! > demoThresholds.systolicBPUpper && 'fixed_systolic_high', lastBP && lastBP.systolicBP! < demoThresholds.systolicBPLower && 'fixed_systolic_low'].filter((reason): reason is string => typeof reason === 'string');
    if (fixedReasons.length) return { level: 'worsening', score: 10, reasons: fixedReasons, assessedAt };

    const context = latest.activity as Context;
    const observation = baseline.observations?.find(item => item.context === context);
    const values = baseline.values ?? {};
    const upper = Math.min(values[`${context}.heartRateWarningUpper`] ?? (context === 'activity' ? 119 : 105), demoThresholds.heartRateUpper);
    const lower = Math.max(values[`${context}.heartRateWarningLower`] ?? 55, demoThresholds.heartRateLower);
    const oxygenLower = Math.max(values[`${context}.spo2WarningLower`] ?? 94, demoThresholds.spo2Lower);
    const heartSoft = heartRate > upper || heartRate < lower;
    const oxygenSoft = spo2 < oxygenLower;
    const heartDeviation = deviation(heartRate, observation?.heartRate, 3);
    const oxygenDeviation = deviation(spo2, observation?.spo2, 1);
    const heartFlag = heartSoft || heartDeviation >= 3;
    const oxygenFlag = oxygenSoft || oxygenDeviation >= 3;

    const bySecond = new Map(seconds.map(sample => [sample.at, sample]));
    const flags = Array.from({ length: demoThresholds.persistenceSeconds }, (_, index) => {
      const instant = latestSecond - (demoThresholds.persistenceSeconds - 1 - index) * 1000;
      if (!bySecond.has(instant)) return false;
      const window = seconds.filter(item => instant - item.at >= 0 && instant - item.at < demoThresholds.windowSeconds * 1000);
      if (window.length < 5) return false;
      const hr = median(window.map(item => item.heartRate))!;
      const oxygen = median(window.map(item => item.spo2))!;
      return hr > upper || hr < lower || oxygen < oxygenLower || deviation(hr, observation?.heartRate, 3) >= 3 || deviation(oxygen, observation?.spo2, 1) >= 3;
    });
    const persistent = flags.filter(Boolean).length >= demoThresholds.abnormalSeconds && flags.slice(-demoThresholds.endingConsecutiveSeconds).every(Boolean);

    const bpUpper = values[`${context}.systolicBPWarningUpper`] ?? 140;
    const bpSoft = freshBP.length >= 2 && (() => {
      const last = freshBP.at(-1)!;
      const prior = freshBP.slice(0, -1).reverse().find(item => Date.parse(last.timestamp) - Date.parse(item.timestamp) <= 5 * 60_000);
      return Boolean(prior && last.systolicBP! > bpUpper && prior.systolicBP! > bpUpper);
    })();
    if (!persistent && !bpSoft) return { level: 'normal', score: 0, reasons: [], assessedAt };

    const reasons: string[] = [];
    let score = 0;
    if (persistent && heartFlag) { score += Number(heartSoft) + Number(heartDeviation >= 3); reasons.push('heart_rate_persistent'); }
    if (persistent && oxygenFlag) { score += Number(oxygenSoft) + Number(oxygenDeviation >= 3); reasons.push('spo2_persistent'); }
    if (bpSoft) { score++; reasons.push('blood_pressure_confirmed_twice'); }
    if (score && context !== 'activity') { score++; reasons.push('rest_or_night'); }
    if (reasons.filter(reason => reason.endsWith('_persistent') || reason === 'blood_pressure_confirmed_twice').length >= 2) { score = Math.max(score + 2, 5); reasons.push('multiple_vitals'); }
    return { level: score >= 5 ? 'worsening' : 'abnormal', score: Math.max(score, 2), reasons, assessedAt };
  }
}
