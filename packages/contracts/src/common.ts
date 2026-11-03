import { Type, type Static } from '@sinclair/typebox';

export const TimestampSchema = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$' });
export type Timestamp = Static<typeof TimestampSchema>;
export const ContextSchema = Type.Union([Type.Literal('resting'), Type.Literal('activity'), Type.Literal('night')]);
export type Context = Static<typeof ContextSchema>;
export const MetricSchema = Type.Union([Type.Literal('heartRate'), Type.Literal('spo2'), Type.Literal('systolicBP'), Type.Literal('diastolicBP')]);
export type Metric = Static<typeof MetricSchema>;
export const ExclusionReasonSchema = Type.Union([
  Type.Literal('missing_value'), Type.Literal('device_untrusted'), Type.Literal('acute_anomaly'),
  Type.Literal('wearer_unwell'), Type.Literal('baseline_paused'), Type.Literal('activity_unknown'),
  Type.Literal('insufficient_coverage'), Type.Literal('excluded_readings'), Type.Literal('risk_abnormal'), Type.Literal('risk_worsening'), Type.Literal('duplicate_sample'), Type.Literal('invalid_timestamp'),
]);
export type ExclusionReason = Static<typeof ExclusionReasonSchema>;
export const ToolResultStatusSchema = Type.Union([Type.Literal('success'), Type.Literal('rejected'), Type.Literal('failed')]);
export type ToolResultStatus = Static<typeof ToolResultStatusSchema>;
