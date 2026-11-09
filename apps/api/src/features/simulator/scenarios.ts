import type { VitalSample } from '@anmai/contracts';
import type { PersonalBaseline } from '../monitoring/risk-detector.js';

export type Scenario = 'normal' | 'activity' | 'abnormal' | 'worsening' | 'loose_device';
export const scenarios: Scenario[] = ['normal', 'activity', 'abnormal', 'worsening', 'loose_device'];

export function scenarioSamples(scenario: Scenario, endingAt: Date, baseline: PersonalBaseline = {}): VitalSample[] {
  const context = scenario === 'activity' ? 'activity' : 'resting';
  const observation = baseline.observations?.find(item => item.context === context);
  const normalHeartRate = Math.round(observation?.heartRate?.median ?? 78);
  const activityHeartRate = Math.round(observation?.heartRate?.median ?? 92) + 2;
  const normalSpo2 = Math.round(observation?.spo2?.median ?? 97);
  return Array.from({ length: 35 }, (_, index) => {
    const second = new Date(endingAt.getTime() - (34 - index) * 1000).toISOString();
    return {
      timestamp: second,
      heartRate: scenario === 'normal' ? normalHeartRate : scenario === 'activity' ? activityHeartRate : scenario === 'loose_device' ? 78 : scenario === 'worsening' ? 142 : 112,
      spo2: scenario === 'worsening' ? 90 : scenario === 'normal' || scenario === 'activity' ? normalSpo2 : 97,
      activity: scenario === 'activity' ? 'activity' : 'resting',
      deviceTrusted: scenario !== 'loose_device',
      location: { name: '演示位置：上海市静安区', latitude: 31.2304, longitude: 121.4737 },
    };
  });
}
