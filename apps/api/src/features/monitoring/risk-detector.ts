import type { RiskAssessment, RiskEvidence, VitalSample } from '@anmai/contracts';
import { demoThresholds } from './detection-config.js';
import { median } from './sliding-window.js';
import { conflictingSeconds, metricSeconds, type MetricSecond } from './second-window.js';

type Context = 'resting' | 'activity' | 'night';
type Quality = RiskEvidence['quality']['heartRate'];
interface Metric { median: number; mad: number }
interface Observation { context: Context; heartRate?: Metric; spo2?: Metric }
export interface PersonalBaseline { values?: Record<string, number>; observations?: Observation[] }

function directionalDeviation(value: number, metric: Metric | undefined, scale: number, direction: 'high' | 'low'): number {
  if (!metric) return 0;
  const distance = direction === 'high' ? value - metric.median : metric.median - value;
  return Math.max(0, distance) / Math.max(1.4826 * metric.mad, scale);
}

function recentSeconds(seconds: MetricSecond[], latestSecond: number, span: number): MetricSecond[] {
  return seconds.filter(item => item.at >= latestSecond - (span - 1) * 1000 && item.at <= latestSecond);
}

function qualityFor(seconds: MetricSecond[], conflicts: Set<number>, samples: VitalSample[], metric: 'heartRate' | 'spo2', latestSecond: number): Quality {
  const recent = recentSeconds(seconds, latestSecond, demoThresholds.windowSeconds);
  const supplied = samples.some(sample => sample[metric] !== undefined && Date.parse(sample.timestamp) >= latestSecond - 9000);
  if (!supplied) return 'missing';
  const firstSupplied = samples.find(sample => sample[metric] !== undefined);
  const coveredStart = Math.max(latestSecond - 9000, firstSupplied ? Math.floor(Date.parse(firstSupplied.timestamp) / 1000) * 1000 : latestSecond);
  if ([...conflicts].some(at => at >= latestSecond - 9000 && at <= latestSecond) ||
      recent.length < 5 || recent[0]!.at - coveredStart > demoThresholds.maxRecentGapSeconds * 1000 ||
      latestSecond - recent.at(-1)!.at > demoThresholds.maxRecentGapSeconds * 1000 ||
      recent.some((sample, index) => index > 0 && sample.at - recent[index - 1]!.at > demoThresholds.maxRecentGapSeconds * 1000)) return 'suspect';
  return 'valid';
}

function flaggedSeconds(seconds: MetricSecond[], latestSecond: number, abnormal: (value: number) => boolean): boolean[] {
  const bySecond = new Set(seconds.map(item => item.at));
  return Array.from({ length: demoThresholds.persistenceSeconds }, (_, index) => {
    const instant = latestSecond - (demoThresholds.persistenceSeconds - 1 - index) * 1000;
    if (!bySecond.has(instant)) return false;
    const window = seconds.filter(item => item.at <= instant && item.at > instant - demoThresholds.windowSeconds * 1000);
    return window.length >= 5 && abnormal(median(window.map(item => item.value))!);
  });
}

function persistent(flags: boolean[]): boolean {
  return flags.filter(Boolean).length >= demoThresholds.abnormalSeconds && flags.slice(-demoThresholds.endingConsecutiveSeconds).every(Boolean);
}

function windowMedian(seconds: MetricSecond[], from: number, until: number): number | null {
  const window = seconds.filter(item => item.at >= from && item.at <= until);
  return window.length >= 8 ? median(window.map(item => item.value)) : null;
}

export class RiskDetector {
  evaluate(samples: VitalSample[], baseline: PersonalBaseline = {}): RiskAssessment {
    const ordered = [...samples].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const latest = ordered.at(-1);
    const assessedAt = latest?.timestamp ?? new Date(0).toISOString();
    const latestMs = Date.parse(assessedAt);
    const latestSecond = Math.floor(latestMs / 1000) * 1000;
    const context = latest?.activity ?? 'unknown';
    const emptyEvidence: RiskEvidence = {
      context, quality: { heartRate: 'missing', spo2: 'missing', bloodPressure: 'missing' },
      values: {}, deviation: {}, coverageSeconds: { heartRate: 0, spo2: 0 },
      abnormalSeconds: { heartRate: 0, spo2: 0 }, trend: 'none', fixedBoundary: false,
    };
    const result = (level: RiskAssessment['level'], reasons: string[], evidence: RiskEvidence = emptyEvidence): RiskAssessment => ({ level, reasons, assessedAt, evidence });
    if (!latest || !Number.isFinite(latestMs) || latest.deviceTrusted === false) return result('untrusted_data', ['device_untrusted_or_invalid']);

    const heartSeconds = metricSeconds(ordered, 'heartRate');
    const oxygenSeconds = metricSeconds(ordered, 'spo2');
    const heartRecent = recentSeconds(heartSeconds, latestSecond, demoThresholds.windowSeconds);
    const oxygenRecent = recentSeconds(oxygenSeconds, latestSecond, demoThresholds.windowSeconds);
    const heartQuality = qualityFor(heartSeconds, conflictingSeconds(ordered, 'heartRate'), ordered, 'heartRate', latestSecond);
    const oxygenQuality = qualityFor(oxygenSeconds, conflictingSeconds(ordered, 'spo2'), ordered, 'spo2', latestSecond);
    const freshBP = ordered.filter(sample => sample.deviceTrusted !== false && latestMs - Date.parse(sample.timestamp) <= 30 * 60_000 &&
      latestMs >= Date.parse(sample.timestamp) && sample.systolicBP !== undefined && sample.diastolicBP !== undefined &&
      Number.isFinite(sample.systolicBP) && Number.isFinite(sample.diastolicBP) &&
      sample.systolicBP >= demoThresholds.systolicPlausibleLower && sample.systolicBP <= demoThresholds.systolicPlausibleUpper &&
      sample.diastolicBP >= demoThresholds.diastolicPlausibleLower && sample.diastolicBP <= demoThresholds.diastolicPlausibleUpper &&
      sample.systolicBP > sample.diastolicBP);
    const lastBP = freshBP.at(-1);
    const bpSupplied = ordered.some(sample => sample.systolicBP !== undefined && latestMs - Date.parse(sample.timestamp) <= 30 * 60_000);
    const bpQuality: Quality = lastBP ? 'valid' : bpSupplied ? 'suspect' : 'missing';
    const heartRate = heartQuality === 'valid' ? median(heartRecent.map(item => item.value))! : undefined;
    const spo2 = oxygenQuality === 'valid' ? median(oxygenRecent.map(item => item.value))! : undefined;
    const observation = context === 'unknown' ? undefined : baseline.observations?.find(item => item.context === context);
    const evidence: RiskEvidence = {
      ...emptyEvidence,
      quality: { heartRate: heartQuality, spo2: oxygenQuality, bloodPressure: bpQuality },
      values: { ...(heartRate === undefined ? {} : { heartRate }), ...(spo2 === undefined ? {} : { spo2 }), ...(lastBP ? { systolicBP: lastBP.systolicBP } : {}) },
      coverageSeconds: { heartRate: heartRecent.length, spo2: oxygenRecent.length },
      deviation: {
        ...(heartRate === undefined ? {} : { heartRateHigh: directionalDeviation(heartRate, observation?.heartRate, 3, 'high'), heartRateLow: directionalDeviation(heartRate, observation?.heartRate, 3, 'low') }),
        ...(spo2 === undefined ? {} : { spo2Low: directionalDeviation(spo2, observation?.spo2, 1, 'low') }),
      },
    };
    if (heartQuality !== 'valid' && oxygenQuality !== 'valid' && bpQuality !== 'valid') return result('untrusted_data', ['insufficient_recent_samples'], evidence);

    const fixedReasons = [
      heartRate !== undefined && heartRate > demoThresholds.heartRateUpper && 'fixed_heart_rate_high',
      heartRate !== undefined && heartRate < demoThresholds.heartRateLower && 'fixed_heart_rate_low',
      spo2 !== undefined && spo2 < demoThresholds.spo2Lower && 'fixed_spo2_low',
      lastBP && lastBP.systolicBP! > demoThresholds.systolicBPUpper && 'fixed_systolic_high',
      lastBP && lastBP.systolicBP! < demoThresholds.systolicBPLower && 'fixed_systolic_low',
    ].filter((reason): reason is string => typeof reason === 'string');
    if (fixedReasons.length) return result('worsening', fixedReasons, { ...evidence, fixedBoundary: true });

    if (context === 'unknown') return result('normal', ['activity_unknown'], evidence);
    const values = baseline.values ?? {};
    const upper = Math.min(values[`${context}.heartRateWarningUpper`] ?? (context === 'activity' ? 119 : 105), demoThresholds.heartRateUpper);
    const lower = Math.max(values[`${context}.heartRateWarningLower`] ?? 55, demoThresholds.heartRateLower);
    const oxygenLower = Math.max(values[`${context}.spo2WarningLower`] ?? 94, demoThresholds.spo2Lower);
    const heartHigh = (value: number) => value > upper || directionalDeviation(value, observation?.heartRate, 3, 'high') >= 3;
    const heartLow = (value: number) => value < lower || directionalDeviation(value, observation?.heartRate, 3, 'low') >= 3;
    const oxygenLow = (value: number) => value < oxygenLower || directionalDeviation(value, observation?.spo2, 1, 'low') >= 3;
    const heartFlags = heartQuality === 'valid' ? flaggedSeconds(heartSeconds, latestSecond, value => heartHigh(value) || heartLow(value)) : [];
    const oxygenFlags = oxygenQuality === 'valid' ? flaggedSeconds(oxygenSeconds, latestSecond, oxygenLow) : [];
    const heartPersistent = persistent(heartFlags);
    const oxygenPersistent = persistent(oxygenFlags);
    evidence.abnormalSeconds.heartRate = heartFlags.filter(Boolean).length;
    evidence.abnormalSeconds.spo2 = oxygenFlags.filter(Boolean).length;

    const bpUpper = values[`${context}.systolicBPWarningUpper`] ?? 140;
    const bpSoft = freshBP.length >= 2 && (() => {
      const last = freshBP.at(-1)!;
      const prior = freshBP.slice(0, -1).reverse().find(item => Date.parse(last.timestamp) - Date.parse(item.timestamp) <= 5 * 60_000);
      return Boolean(prior && last.systolicBP! > bpUpper && prior.systolicBP! > bpUpper);
    })();
    if (!heartPersistent && !oxygenPersistent && !bpSoft) return result('normal', [], evidence);

    const reasons: string[] = [];
    if (heartPersistent) reasons.push('heart_rate_persistent');
    if (oxygenPersistent) reasons.push('spo2_persistent');
    if (bpSoft) reasons.push('blood_pressure_confirmed_twice');
    const previousFrom = latestSecond - 19_000;
    const previousUntil = latestSecond - 10_000;
    const currentFrom = latestSecond - 9_000;
    const previousHeart = heartPersistent ? windowMedian(heartSeconds, previousFrom, previousUntil) : null;
    const currentHeart = heartPersistent ? windowMedian(heartSeconds, currentFrom, latestSecond) : null;
    const previousOxygen = oxygenPersistent ? windowMedian(oxygenSeconds, previousFrom, previousUntil) : null;
    const currentOxygen = oxygenPersistent ? windowMedian(oxygenSeconds, currentFrom, latestSecond) : null;
    if (previousHeart !== null && currentHeart !== null && heartHigh(previousHeart) && heartHigh(currentHeart) && currentHeart - previousHeart >= demoThresholds.trendHeartRateBpm) evidence.trend = 'heart_rate_rising';
    else if (previousHeart !== null && currentHeart !== null && heartLow(previousHeart) && heartLow(currentHeart) && previousHeart - currentHeart >= demoThresholds.trendHeartRateBpm) evidence.trend = 'heart_rate_falling';
    else if (previousOxygen !== null && currentOxygen !== null && oxygenLow(previousOxygen) && oxygenLow(currentOxygen) && previousOxygen - currentOxygen >= demoThresholds.trendSpo2Points) evidence.trend = 'spo2_falling';
    if (evidence.trend !== 'none') return result('worsening', [...reasons, 'clear_worsening_trend'], evidence);
    return result('abnormal', reasons, evidence);
  }
}
