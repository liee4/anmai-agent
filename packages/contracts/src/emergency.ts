import { Type, type Static } from '@sinclair/typebox';
import { TimestampSchema } from './common.js';
import { LocationSchema } from './vitals.js';

export const RiskLevelSchema = Type.Union([Type.Literal('normal'), Type.Literal('mild'), Type.Literal('abnormal'), Type.Literal('worsening'), Type.Literal('untrusted_data')]);
export type RiskLevel = Static<typeof RiskLevelSchema>;
export const RiskAssessmentSchema = Type.Object({ level: RiskLevelSchema, score: Type.Number({ minimum: 0 }), reasons: Type.Array(Type.String()), assessedAt: TimestampSchema }, { additionalProperties: false });
export type RiskAssessment = Static<typeof RiskAssessmentSchema>;
export const EventStateSchema = Type.Union([Type.Literal('wearer_alert'), Type.Literal('safe_recheck'), Type.Literal('primary_contact'), Type.Literal('other_contacts'), Type.Literal('relative_takeover'), Type.Literal('simulated_call'), Type.Literal('closed')]);
export type EventState = Static<typeof EventStateSchema>;
export const ResponseKindSchema = Type.Union([Type.Literal('safe'), Type.Literal('unwell'), Type.Literal('takeover'), Type.Literal('decline'), Type.Literal('timeout')]);
export type ResponseKind = Static<typeof ResponseKindSchema>;
export const TimerSettingsSchema = Type.Object({ wearerResponseSeconds: Type.Integer({ minimum: 1 }), primaryRelativeSeconds: Type.Integer({ minimum: 1 }), otherRelativesSeconds: Type.Integer({ minimum: 1 }), safeRecheckSeconds: Type.Integer({ minimum: 1 }) }, { additionalProperties: false });
export type TimerSettings = Static<typeof TimerSettingsSchema>;
export const TimelineEntrySchema = Type.Object({ id: Type.String(), eventId: Type.String(), at: TimestampSchema, kind: Type.String(), detail: Type.String() }, { additionalProperties: false });
export type TimelineEntry = Static<typeof TimelineEntrySchema>;
export const EmergencyEventSchema = Type.Object({ eventId: Type.String(), wearerId: Type.String(), state: EventStateSchema, stateVersion: Type.Integer({ minimum: 1 }), createdAt: TimestampSchema, deadlineAt: Type.Union([TimestampSchema, Type.Null()]), timerSettings: TimerSettingsSchema, baselineVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]), location: Type.Union([LocationSchema, Type.Null()]), risk: RiskAssessmentSchema }, { additionalProperties: false });
export type EmergencyEvent = Static<typeof EmergencyEventSchema>;

