import { Type } from '@sinclair/typebox';
import type { EmergencyEvent, RiskAssessment, VitalSample } from '@anmai/contracts';
import { VitalSampleSchema, RiskAssessmentSchema } from '@anmai/contracts';
import type { EmergencyService } from '../emergency/emergency-service.js';
import type { EmergencyCommand } from '../emergency/state-machine.js';
import type { RiskDetector, PersonalBaseline } from '../monitoring/risk-detector.js';
import { ToolRegistry } from './tool-registry.js';
import type { RiskReviewService } from '../monitoring/risk-review-service.js';

export type AgentTrigger =
  | { kind: 'vitals'; wearerId: string; samples: VitalSample[]; baselineVersion?: number | null; baseline?: PersonalBaseline }
  | { kind: 'response'; eventId: string; stateVersion: number; command: EmergencyCommand }
  | { kind: 'deadline' };
export interface AgentRunResult { risk: RiskAssessment | null; event: EmergencyEvent | null; ok: boolean; executed: number; trace: string[] }

export class AnmaiAgent {
  private readonly tools = new ToolRegistry();

  constructor(detector: RiskDetector, private readonly emergency: EmergencyService, private readonly review?: RiskReviewService) {
    this.tools.register('evaluate_risk', Type.Object({ samples: Type.Array(VitalSampleSchema), baseline: Type.Optional(Type.Any()) }), async input => detector.evaluate(input.samples, input.baseline as PersonalBaseline | undefined));
    this.tools.register('create_alert', Type.Object({ wearerId: Type.String(), risk: RiskAssessmentSchema, baselineVersion: Type.Union([Type.Integer(), Type.Null()]), baseline: Type.Optional(Type.Any()), location: Type.Optional(Type.Union([Type.Object({ name: Type.String(), latitude: Type.Number(), longitude: Type.Number() }), Type.Null()])) }), async input => emergency.start(input.wearerId, input.risk, input.baselineVersion, input.location ?? undefined, (input.baseline ?? {}) as PersonalBaseline), input => input.risk.level === 'abnormal' || input.risk.level === 'worsening');
    this.tools.register('record_response', Type.Object({ eventId: Type.String(), stateVersion: Type.Integer(), kind: Type.String() }), async input => emergency.act(input.eventId, input.stateVersion, { kind: input.kind as EmergencyCommand['kind'] }), input => {
      const current = emergency.get(input.eventId);
      return Boolean(current && ['wearer_unwell', 'wearer_safe', 'relative_takeover', 'relative_decline', 'worsening', 'normal_60s', 'close'].includes(input.kind));
    });
    this.tools.register('run_deadlines', Type.Object({}), async () => emergency.runDue());
  }

  async handle(trigger: AgentTrigger): Promise<AgentRunResult> {
    const trace: string[] = [];
    if (trigger.kind === 'vitals') {
      trace.push('observe:vitals');
      const current = this.emergency.getActiveForWearer(trigger.wearerId);
      const risk = await this.tools.execute<RiskAssessment>('evaluate_risk', { samples: trigger.samples, baseline: current?.baselineSnapshot ?? trigger.baseline }, {});
      trace.push('assess:risk');
      if (this.review && (risk.level === 'normal' || risk.level === 'worsening')) await this.review.assess(trigger.wearerId, risk, trigger.samples, trigger.baselineVersion ?? null, trigger.baseline ?? {});
      const previousRisk = current ? this.emergency.getLastObservedRisk(current.eventId) : null;
      const active = current ? this.emergency.observeActiveRisk(current, risk) : null;
      if (active?.state === 'closed') {
        trace.push('decide:recovered', 'act:close_alert', 'observe:event');
        return { risk, event: null, ok: true, executed: 2, trace };
      }
      const newlyWorsened = risk.level === 'worsening' && (previousRisk?.level !== 'worsening' || risk.reasons.some(reason => reason.startsWith('fixed_') && !previousRisk.reasons.includes(reason)));
      if (active && newlyWorsened && (active.state === 'wearer_alert' || active.state === 'safe_recheck' || active.state === 'primary_contact')) {
        trace.push('decide:worsening');
        const changed = await this.tools.execute<{ ok: boolean; event: EmergencyEvent | null }>('record_response', { eventId: active.eventId, stateVersion: active.stateVersion, kind: 'worsening' }, {});
        trace.push(active.state === 'primary_contact' ? 'act:contact_others' : 'act:contact_primary', 'observe:event');
        return { risk, event: changed.event, ok: changed.ok, executed: 2, trace };
      }
      if (active) {
        trace.push('decide:active_monitor', 'observe:event');
        return { risk, event: active, ok: true, executed: 1, trace };
      }
      if (this.review && risk.level === 'abnormal') {
        const reviewed = await this.review.assess(trigger.wearerId, risk, trigger.samples, trigger.baselineVersion ?? null, trigger.baseline ?? {});
        trace.push(`assess:model_${reviewed.action}`);
        const concurrentEvent = this.emergency.getActiveForWearer(trigger.wearerId);
        if (concurrentEvent || reviewed.action === 'stale') return { risk, event: concurrentEvent, ok: true, executed: 1, trace };
        if (reviewed.action === 'observe') return { risk, event: null, ok: true, executed: 1, trace };
      }
      const monitor = active ? 'new' : this.emergency.observeRisk(trigger.wearerId, risk);
      if (monitor === 'suppress') {
        trace.push('decide:confirmed_monitor');
        return { risk, event: null, ok: true, executed: 1, trace };
      }
      if (risk.level !== 'abnormal' && risk.level !== 'worsening') {
        trace.push('decide:monitor');
        return { risk, event: active, ok: true, executed: 1, trace };
      }
      trace.push(monitor === 'recheck' ? 'decide:one_recheck' : 'decide:wearer_alert');
      const event = await this.tools.execute<EmergencyEvent>('create_alert', { wearerId: trigger.wearerId, risk, baselineVersion: trigger.baselineVersion ?? null, baseline: trigger.baseline, location: trigger.samples.at(-1)?.location ?? null }, {});
      trace.push('act:create_alert', 'observe:event');
      if (monitor === 'worsening' || risk.level === 'worsening') {
        const contacted = await this.tools.execute<{ ok: boolean; event: EmergencyEvent | null }>('record_response', { eventId: event.eventId, stateVersion: event.stateVersion, kind: 'worsening' }, {});
        trace.push('act:contact_primary', 'observe:event');
        return { risk, event: contacted.event, ok: contacted.ok, executed: 3, trace };
      }
      return { risk, event, ok: true, executed: 2, trace };
    }
    if (trigger.kind === 'response') {
      trace.push('observe:event', `decide:${trigger.command.kind}`);
      const result = await this.tools.execute<{ ok: boolean; event: EmergencyEvent | null }>('record_response', { eventId: trigger.eventId, stateVersion: trigger.stateVersion, kind: trigger.command.kind }, {});
      trace.push('act:record_response', 'observe:event');
      return { risk: result.event?.risk ?? null, event: result.event, ok: result.ok, executed: 1, trace };
    }
    trace.push('observe:deadlines', 'decide:run_due');
    const executed = await this.tools.execute<number>('run_deadlines', {}, {});
    trace.push('act:run_deadlines', 'observe:events');
    return { risk: null, event: null, ok: true, executed, trace };
  }
}
