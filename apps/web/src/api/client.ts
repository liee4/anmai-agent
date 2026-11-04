import type { EmergencyEvent, RiskAssessment, TimerSettings } from '@anmai/contracts';

export interface BaselineView {
  version: number;
  cycleId: string;
  publishedAt: string;
  baseline: { observations?: { context: string; hours: number; heartRate?: { median: number }; spo2?: { median: number } }[]; values?: Record<string, number>; provider?: string; evidenceWeights?: { current: number; recent: number[]; longTerm: number } };
}
export interface Dashboard {
  wearerId: string;
  risk: RiskAssessment | null;
  event: EmergencyEvent | null;
  confirmedMonitor: { confirmedAt: string; recheckAt: string; recheckCount: number } | null;
  baseline: BaselineView | null;
  baselineState: { status: string; pausedAt: string | null; reason: string | null };
  provider: string;
}

async function json<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { ...(options?.body == null ? {} : { 'Content-Type': 'application/json' }), ...options?.headers } });
  const body = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

export const api = {
  dashboard: (wearerId: string) => json<Dashboard>(`/api/dashboard/${encodeURIComponent(wearerId)}`),
  nextDemoHistory: (wearerId: string) => json<{ inputMode: string; wearerId: string; data: { timestamp: string; heartRate: number; spo2: number; activity: string }[] }>(`/api/simulator/history/next?wearerId=${encodeURIComponent(wearerId)}`),
  resetDemo: (wearerId: string) => json<{ reset: boolean }>('/api/simulator/reset', { method: 'POST', body: JSON.stringify({ wearerId, confirmation: 'RESET_DEMO_DATA' }) }),
  ingest: (payload: unknown) => json<{ detectedMode: string; coveredDays: number; successfulDays: number; invalidDays: number; completedCycles: number; modelCalls: number; baselineVersion: number | null }>('/api/ingest', { method: 'POST', body: JSON.stringify(payload) }),
  scenario: (wearerId: string, scenario: string) => json<{ risk: RiskAssessment; event: EmergencyEvent | null }>(`/api/simulator/${scenario}`, { method: 'POST', body: JSON.stringify({ wearerId }) }),
  action: (event: EmergencyEvent, kind: string) => json<{ ok: boolean; event: EmergencyEvent }>(`/api/events/${event.eventId}/actions`, { method: 'POST', body: JSON.stringify({ stateVersion: event.stateVersion, kind }) }),
  resume: (wearerId: string) => json<{ resumed: boolean }>(`/api/baselines/${encodeURIComponent(wearerId)}/resume`, { method: 'POST' }),
  deadlines: () => json<{ executed: number }>('/api/deadlines/run', { method: 'POST' }),
  timers: () => json<TimerSettings>('/api/settings/timers'),
  setTimers: (settings: TimerSettings) => json<TimerSettings>('/api/settings/timers', { method: 'PUT', body: JSON.stringify(settings) }),
  timeline: (eventId: string) => json<{ at: string; kind: string; detail: string }[]>(`/api/events/${eventId}/timeline`),
};
