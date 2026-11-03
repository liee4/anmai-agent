import type { VitalSample } from '@anmai/contracts';

export type Scenario = 'normal' | 'activity' | 'abnormal' | 'worsening' | 'loose_device';
export const scenarios: Scenario[] = ['normal', 'activity', 'abnormal', 'worsening', 'loose_device'];

export function scenarioSamples(scenario: Scenario, endingAt: Date): VitalSample[] {
  return Array.from({ length: 35 }, (_, index) => {
    const second = new Date(endingAt.getTime() - (34 - index) * 1000).toISOString();
    return {
      timestamp: second,
      heartRate: scenario === 'normal' || scenario === 'loose_device' ? 78 : scenario === 'worsening' ? 142 : 112,
      spo2: scenario === 'worsening' ? 90 : 97,
      activity: scenario === 'activity' ? 'activity' : 'resting',
      deviceTrusted: scenario !== 'loose_device',
      location: { name: '演示位置：上海市静安区', latitude: 31.2304, longitude: 121.4737 },
    };
  });
}
