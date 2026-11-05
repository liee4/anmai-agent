import type { EmergencyEvent, EventState, RiskAssessment, TimerSettings } from '@anmai/contracts';

export type EmergencyCommand = { kind: 'wearer_unwell' | 'wearer_safe' | 'relative_takeover' | 'relative_decline' | 'deadline' | 'worsening' | 'close' | 'normal_60s' };

function deadline(now: Date, seconds: number): string { return new Date(now.getTime() + seconds * 1000).toISOString(); }

export function createEvent(eventId: string, wearerId: string, risk: RiskAssessment, timerSettings: TimerSettings, now: Date, baselineVersion: number | null = null, baselineSnapshot: unknown = null): EmergencyEvent {
  return { eventId, wearerId, state: 'wearer_alert', stateVersion: 1, createdAt: now.toISOString(), deadlineAt: deadline(now, timerSettings.wearerResponseSeconds), timerSettings, baselineVersion, baselineSnapshot, location: null, risk };
}

export function reduceEmergencyState(event: EmergencyEvent, command: EmergencyCommand, now: Date): EmergencyEvent {
  if (command.kind === 'wearer_safe' && (event.state === 'primary_contact' || event.state === 'other_contacts') && event.risk.level === 'worsening') return event;
  const next = determineNextState(event.state, command.kind);
  if (next === null) return event;
  const seconds = next === 'wearer_alert' ? event.timerSettings.wearerResponseSeconds : next === 'safe_recheck' ? event.timerSettings.safeRecheckSeconds : next === 'primary_contact' ? event.timerSettings.primaryRelativeSeconds : next === 'other_contacts' ? event.timerSettings.otherRelativesSeconds : null;
  return { ...event, state: next, stateVersion: event.stateVersion + 1, deadlineAt: seconds === null ? null : deadline(now, seconds) };
}

function determineNextState(state: EventState, kind: EmergencyCommand['kind']): EventState | null {
  if (kind === 'close' && state !== 'closed') return 'closed';
  if (state === 'closed' || state === 'relative_takeover') return null;
  if (kind === 'wearer_safe' && (state === 'primary_contact' || state === 'other_contacts')) return 'closed';
  if (kind === 'relative_takeover' && (state === 'primary_contact' || state === 'other_contacts' || state === 'simulated_call')) return 'relative_takeover';
  if (state === 'wearer_alert') {
    if (kind === 'wearer_unwell' || kind === 'worsening' || kind === 'deadline') return 'primary_contact';
    if (kind === 'wearer_safe') return 'closed';
  }
  if (state === 'safe_recheck') {
    if (kind === 'worsening') return 'primary_contact';
    if (kind === 'deadline') return 'wearer_alert';
    if (kind === 'normal_60s') return 'closed';
  }
  if (state === 'primary_contact' && (kind === 'deadline' || kind === 'relative_decline' || kind === 'worsening')) return 'other_contacts';
  if (state === 'other_contacts' && (kind === 'deadline' || kind === 'relative_decline')) return 'simulated_call';
  return null;
}
